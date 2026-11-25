import {
  caissesList,
  clientsDettesRetrieve,
  depensesList,
  facturesList,
  mouvementsStockEtatList,
  semainesBilanRetrieve,
  semainesControlesClotureList,
  semainesList,
  semainesPersonnesRetrieve,
  semainesPlanningRetrieve,
  toutesLesPages,
  usersMeRetrieve,
  type BilanSemaine,
  type Caisse,
  type Depense,
  type Facture,
  type LigneEtat,
  type PersonnesAffectables,
  type Semaine as SemaineServeur,
} from '@/api';
import type { PersonneDuPoste } from '@/auth/connexion.ts';
import { connexionUtilisateursList } from '@/api';
import type { Creneau } from '@/utils';

import type { Profil } from '../../../profils.ts';
import type { Matiere } from '../../comptoir/depenses/types.ts';
import type {
  AffectationJour,
  Cloture,
  Controle,
  CreneauReel,
  Indicateurs,
  InstantaneSemaines,
  Passation,
  Personne,
  Planning,
  Semaine,
  StatutSemaine,
} from './types.ts';

/*
 * Lecture de « Gestion › Semaines » sur le vrai serveur : `semaines/`, `{id}/planning/`, les caisses
 * (créneaux réels), `{id}/bilan/` (chiffres d'une semaine), `{id}/controles-cloture/` pour la semaine
 * ouverte. Les personnes à affecter viennent de `semaines/personnes/` ; à défaut (accès refusé), de la
 * liste du poste de confiance puis des personnes déjà affectées.
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

type PersonneServeur = { id: number; nom: string; profil?: string | null } | null;

const personne = (p: PersonneServeur, profil: Profil): Personne | null =>
  p ? { id: String(p.id), nom: p.nom, profil: (p.profil as Profil) ?? profil } : null;

const STATUTS: Record<string, StatutSemaine> = {
  planifiee: 'planifiee',
  ouverte: 'ouverte',
  cloturee: 'cloturee',
};

type SemaineLue = SemaineServeur & {
  planifiee_par?: string;
  ouverte_le?: string | null;
  ouverte_par?: string;
  cloturee_le?: string | null;
  cloturee_par?: string;
};

export function versSemaine(s: SemaineLue): Semaine {
  const passage = (par: string | undefined, le: string | null | undefined) =>
    le ? { par: par ?? '', jour: jourDeYaounde(le), heure: heureDeYaounde(le) } : null;
  return {
    id: s.code,
    idServeur: s.id,
    numero: s.numero,
    du: s.du,
    au: s.au,
    statut: STATUTS[s.statut] ?? 'planifiee',
    gerant: personne(s.gerant as PersonneServeur, 'gerant'),
    production: personne(s.production as PersonneServeur, 'production'),
    planifieePar: s.planifiee_par ?? '',
    ouverture: passage(s.ouverte_par, s.ouverte_le),
    cloture: passage(s.cloturee_par, s.cloturee_le),
  };
}

/** Un créneau réellement tenu : une caisse ouverte ou fermée de la semaine. */
export function versCreneau(c: Caisse): CreneauReel {
  return {
    jour: c.jour,
    type: (c.creneau === 'jour' ? 'jour' : 'nuit') as Creneau,
    caissiere: { id: String(c.caissiere.id), nom: c.caissiere.nom, profil: 'caissier' },
    ouverture: heureDeYaounde(c.ouverte_le),
    fermeture: c.fermee_le ? heureDeYaounde(c.fermee_le) : null,
    ecart: c.ecart,
    enCours: c.en_cours,
  };
}

/** Planning de la semaine : jour → caissière de chaque créneau (identifiant, vide : à affecter). */
export function versPlanning(
  creneaux: { jour: string; creneau: string; caissiere: PersonneServeur }[],
): Record<string, AffectationJour> {
  const planning: Record<string, AffectationJour> = {};
  for (const c of creneaux) {
    const jour = (planning[c.jour] ??= { jour: '', nuit: '' });
    jour[c.creneau === 'jour' ? 'jour' : 'nuit'] = c.caissiere ? String(c.caissiere.id) : '';
  }
  return planning;
}

type ControleServeur = {
  cle: string;
  niveau: string;
  detail?: string;
  factures?: { numero: string; libelle: string }[];
  numeros?: number[];
  session?: { type: string; jour: string; par: string; heure: string };
  clients?: number;
  total?: number;
};

/** Les contrôles de clôture du serveur, dans les types de l'écran (les inconnus sont écartés). */
export function versControles(lignes: readonly ControleServeur[], responsable: string): Controle[] {
  const controles: Controle[] = [];
  for (const l of lignes) {
    const bloquant = l.niveau === 'bloquant';
    if (l.cle === 'caisse') {
      controles.push({
        cle: 'caisse',
        niveau: bloquant ? 'bloquant' : 'ok',
        ...(l.session
          ? {
              session: {
                type: (l.session.type === 'jour' ? 'jour' : 'nuit') as Creneau,
                jour: l.session.jour,
                par: l.session.par,
                heure: l.session.heure,
              },
            }
          : {}),
      });
    } else if (l.cle === 'production') {
      controles.push({ cle: 'production', niveau: bloquant ? 'bloquant' : 'ok', responsable });
    } else if (l.cle === 'dettes_clients') {
      controles.push({
        cle: 'dettes',
        niveau: l.niveau === 'ok' ? 'ok' : 'surveiller',
        clients: l.clients ?? 0,
        montant: l.total ?? 0,
      });
    } else if (l.cle.startsWith('facture')) {
      controles.push({
        cle: 'factures',
        niveau: l.niveau === 'ok' ? 'ok' : 'surveiller',
        factures: (l.factures ?? []).map((f) => ({ numero: f.numero, libelle: f.libelle })),
      });
    } else if (l.cle.startsWith('demande')) {
      controles.push({
        cle: 'demandes',
        niveau: l.niveau === 'ok' ? 'ok' : 'surveiller',
        numeros: l.numeros ?? [],
      });
    }
  }
  return controles;
}

/** Les chiffres d'une semaine, tels que `semaines/{id}/bilan/` les donne. */
export const versBilan = (b: BilanSemaine): Indicateurs => ({
  recette: b.recette,
  depenses: { nombre: b.depenses.nombre, montant: b.depenses.montant },
  productions: { nombre: b.productions.nombre, sacs: b.productions.sacs },
  ecartCumule: b.ecart_caisse_cumule,
  caisses: b.caisses,
  receptions: b.receptions,
});

/** Indicateurs d'une semaine recomposés d'après ses caisses et ses dépenses, si le bilan est illisible. */
export function indicateursDeLaSemaine(
  caisses: readonly Caisse[],
  depenses: readonly Depense[],
): Indicateurs {
  const validees = depenses.filter((d) => d.statut === 'validee');
  return {
    recette: 0,
    depenses: { nombre: validees.length, montant: validees.reduce((s, d) => s + d.montant, 0) },
    productions: { nombre: 0, sacs: 0 },
    ecartCumule: caisses.reduce((s, c) => s + (c.ecart ?? 0), 0),
    caisses: caisses.length,
    receptions: 0,
  };
}

/** Rapport de passation d'une semaine ouverte, tel que l'écran l'annonce avant la clôture. */
export function passationPrevue(
  caisses: readonly Caisse[],
  dettesClients: number,
  stockBas: Matiere[],
  numeroSuivante: number,
  destinataire: Personne | null,
  /** Reste dû aux fournisseurs (factures non soldées), entiers FCFA. */
  dettesFournisseurs = 0,
): Passation {
  const fermees = caisses.filter((c) => !c.en_cours && c.compte !== null);
  const derniere = fermees.at(-1);
  return {
    numeroSuivante,
    destinataire,
    caisses: {
      derniere: derniere
        ? { jour: derniere.jour, par: derniere.caissiere.nom, compte: derniere.compte ?? 0 }
        : null,
      ecartCumule: caisses.reduce((s, c) => s + (c.ecart ?? 0), 0),
    },
    dettes: { clients: -dettesClients, fournisseurs: dettesFournisseurs },
    stockBas,
    incidents: [],
  };
}

/** Compose l'instantané de l'écran des semaines à partir des routes du serveur. */
export async function lireSemainesReelles(): Promise<InstantaneSemaines> {
  const [moi, semaines, caisses, depenses, personnes, dettes, etat, factures] = await Promise.all([
    usersMeRetrieve().then(
      (r) => r.data as unknown as { url: string; name: string; profil: Profil },
    ),
    toutesLesPages<SemaineServeur>(
      (page) => semainesList({ page }) as Promise<Page<SemaineServeur>>,
    ),
    toutesLesPages<Caisse>((page) => caissesList({ page }) as Promise<Page<Caisse>>).catch(
      () => [] as Caisse[],
    ),
    toutesLesPages<Depense>((page) => depensesList({ page }) as Promise<Page<Depense>>).catch(
      () => [] as Depense[],
    ),
    semainesPersonnesRetrieve()
      .then((r) => r.data as unknown as PersonnesAffectables)
      .catch(() => null),
    clientsDettesRetrieve()
      .then((r) => r.data as unknown as { total: number })
      .catch(() => null),
    mouvementsStockEtatList()
      .then((r) => r.data as unknown as LigneEtat[])
      .catch(() => [] as LigneEtat[]),
    toutesLesPages<Facture>((page) => facturesList({ page }) as Promise<Page<Facture>>).catch(
      () => [] as Facture[],
    ),
  ]);
  const resteDu = factures.reduce((somme, f) => somme + f.reste, 0);
  const lues = (semaines as unknown as SemaineLue[]).map(versSemaine);
  const ouverte = semaines.find((s) => s.statut === 'ouverte');

  const planning: Planning = {};
  await Promise.all(
    semaines.map(async (s) => {
      const lu = await semainesPlanningRetrieve(s.id)
        .then(
          (r) =>
            r.data as unknown as {
              creneaux: { jour: string; creneau: string; caissiere: PersonneServeur }[];
            },
        )
        .catch(() => null);
      if (lu) planning[s.code] = versPlanning(lu.creneaux);
    }),
  );

  const indicateurs: Record<string, Indicateurs> = {};
  await Promise.all(
    semaines.map(async (s) => {
      const bilan = await semainesBilanRetrieve(s.id)
        .then((r) => r.data as unknown as BilanSemaine)
        .catch(() => null);
      indicateurs[s.code] = bilan
        ? versBilan(bilan)
        : indicateursDeLaSemaine(
            caisses.filter((c) => c.semaine === s.id),
            depenses.filter((d) => d.semaine === s.id),
          );
    }),
  );

  const clotures: Record<string, Cloture> = {};
  if (ouverte) {
    const controles = await semainesControlesClotureList(ouverte.id)
      .then((r) =>
        Array.isArray(r.data) ? r.data : ((r.data as { results?: unknown[] }).results ?? []),
      )
      .catch(() => []);
    const stockBas = etat.filter((l) => l.statut === 'stock_bas').map((l) => l.matiere as Matiere);
    clotures[ouverte.code] = {
      controles: versControles(controles as ControleServeur[], ouverte.production?.nom ?? ''),
      passation: passationPrevue(
        caisses.filter((c) => c.semaine === ouverte.id),
        dettes?.total ?? 0,
        stockBas,
        ouverte.numero + 1,
        null,
        resteDu,
      ),
    };
  }

  // Sans accès à la liste des personnes affectables, la liste du poste de confiance (comptoir).
  const poste = personnes
    ? []
    : await connexionUtilisateursList()
        .then((r) => r.data as unknown as PersonneDuPoste[])
        .catch(() => [] as PersonneDuPoste[]);
  const parProfil = (profils: readonly string[]): Personne[] => {
    if (personnes) {
      const liste = profils.includes('gerant')
        ? personnes.gerants
        : profils.includes('production')
          ? personnes.responsables
          : personnes.caissieres;
      return liste.map((p) => ({ id: String(p.id), nom: p.nom, profil: profils[0] as Profil }));
    }
    return poste
      .filter((p) => profils.includes(p.profil))
      .map((p) => ({ id: String(p.id), nom: p.nom, profil: p.profil }));
  };
  const connues = new Map<string, Personne>();
  for (const s of lues) {
    for (const p of [s.gerant, s.production]) if (p) connues.set(p.id, p);
  }
  const avecConnues = (liste: Personne[], profil: Profil) => [
    ...liste,
    ...[...connues.values()].filter(
      (p) => p.profil === profil && !liste.some((l) => l.id === p.id),
    ),
  ];

  return {
    moi: { id: moi.url.split('/').filter(Boolean).at(-1) ?? '', nom: moi.name, profil: moi.profil },
    semaines: lues.sort((a, b) => b.numero - a.numero),
    gerants: avecConnues(parProfil(['gerant']), 'gerant'),
    responsables: avecConnues(parProfil(['production']), 'production'),
    caissieres: parProfil(['caissier']),
    planning,
    creneaux: caisses.map(versCreneau),
    indicateurs,
    clotures,
  };
}
