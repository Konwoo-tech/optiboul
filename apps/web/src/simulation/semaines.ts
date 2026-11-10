import {
  aDesBloquants,
  droitsSemaines,
  joursDeLaSemaine,
  peutPlanifier,
  raisonOuverture,
  semaineDuJour,
} from '@/espaces/gestion/semaines/regles.ts';
import type {
  Cloture,
  Controle,
  Creneau,
  CreneauReel,
  Incident,
  Indicateurs,
  InstantaneSemaines,
  Passation,
  Personne,
  Semaine,
} from '@/espaces/gestion/semaines/types.ts';

import { lectureCaisses } from './caisses.ts';
import { clientsSimules } from './clients.ts';
import {
  dateDuJour,
  heureCourante,
  reouvertureDeSession,
  sessionOuverteDuComptoir,
} from './comptoir.ts';
import { demandesEnAttente } from './demandes.ts';
import { depensesDeSemaine } from './depenses.ts';
import { comptesActifs } from './comptes.ts';
import { facturesSimulees, libelleFactureFr, receptionsParSemaine } from './fournisseurs.ts';
import { consigner } from './journal.ts';
import {
  affecter,
  cloturerSemaine,
  lirePlanning,
  lireSemaines,
  marquerPlanifiee,
  ouvrirSemaine,
  personne,
  planifierCreneau,
} from './planning.ts';
import { productionsRattachees } from './production.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { matieresSousLeBesoin } from './stocks.ts';

/*
 * Faux serveur de « Gestion › Semaines » (US-172, récits US-030 à US-035) : les règles de la
 * maquette « OptiBoul ERP v2 » (fonction `vSemaines`, états `weeks`, `planning`). Les semaines et
 * le planning vivent dans `planning.ts` ; les caisses, les dépenses, les demandes, les clients et
 * le stock sont lus à leur source. La production est lue dans `production.ts`, les réceptions et
 * les factures fournisseurs dans `fournisseurs.ts`.
 */

type Corps = Record<string, unknown>;
type Journal = { heure: string; qui: string; quoi: string };
type Profil = Personne['profil'];

const RACINE = '/api/v1/simulation/gestion/semaines/';

const probleme = (status: number, code: string, detail: string, autres: object = {}) =>
  Response.json({ detail, code, ...autres }, { status });
const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

/** Sacs que la maquette compte pour le stock quand aucun plan n'est en cours (`totalSacs||8`). */
const SACS_SANS_PLAN = 8;

/** Recette des semaines dont les caisses ne sont plus détaillées (maquette : `weeks[].recette`). */
const RECETTE_ANTERIEURE = (): Record<string, number> => ({ S41: 2_214_600 });

type Facture = {
  numero: string;
  libelle: string;
  montant: number;
  payee: boolean;
  retard: boolean;
};

/** Factures fournisseurs, lues dans `fournisseurs.ts` (leur source) avec le libellé français des contrôles. */
const FACTURES = (): Facture[] =>
  facturesSimulees().map((f) => ({
    numero: f.numero,
    libelle: libelleFactureFr(f),
    montant: f.montant,
    payee: f.statut === 'payee',
    retard: f.enRetard,
  }));

let journal: Journal[] = [];

/** Remet l'état propre aux semaines à zéro (tests) ; le planning est remis par `planning.ts`, la production par `production.ts`. */
export function reinitialiserSemaines(): void {
  journal = [];
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalSemaines(): readonly Journal[] {
  return journal;
}

function tracer(qui: string, quoi: string, changement?: { avant: string; apres: string }): void {
  journal = [{ heure: heureCourante(), qui, quoi }, ...journal];
  consigner({ auteur: qui, type: 'semaine', texte: quoi, ...changement });
}

const comme = (id: string, nom: string): Personne =>
  personne(id) ?? { id, nom, profil: 'caissier' };

/** Comptes de démonstration d'un profil, dans l'ordre de l'écran de connexion. */
const comptes = (profil: Profil): Personne[] =>
  comptesActifs()
    .filter((c) => c.profil === profil)
    .map((c) => comme(c.id, c.nom));

const ecartDe = (c: { compte: number | null; attendu: number }): number =>
  c.compte === null ? 0 : c.compte - c.attendu;

function creneauxReels(semaines: readonly Semaine[]): CreneauReel[] {
  return lectureCaisses()
    .sessions.filter((s) => semaineDuJour(semaines, s.jour))
    .map((s) => ({
      jour: s.jour,
      type: s.type,
      caissiere: comme(s.caissiere.id, s.caissiere.nom),
      ouverture: s.ouverture.heure,
      fermeture: s.fermeture?.heure ?? null,
      ecart: s.compte === null ? null : ecartDe(s),
      enCours: s.enCours,
    }));
}

/** Semaine de la production en cours : c'est elle qu'elle bloque. */
const semaineDeLaProduction = (semaines: readonly Semaine[]): string | undefined => {
  const { enCours } = productionsRattachees();
  return enCours ? semaineDuJour(semaines, enCours.date)?.id : undefined;
};

function indicateurs(semaines: readonly Semaine[]): Record<string, Indicateurs> {
  const { sessions } = lectureCaisses();
  const { historique, enCours } = productionsRattachees();
  const anterieures = RECETTE_ANTERIEURE();
  const receptions = receptionsParSemaine();
  const enDirect = enCours ? semaineDuJour(semaines, enCours.date)?.id : undefined;
  return Object.fromEntries(
    semaines.map((s) => {
      const deLaSemaine = sessions.filter((c) => semaineDuJour(semaines, c.jour)?.id === s.id);
      const faites = historique.filter((p) => semaineDuJour(semaines, p.date)?.id === s.id);
      const ici = Boolean(enCours) && enDirect === s.id;
      return [
        s.id,
        {
          recette:
            (anterieures[s.id] ?? 0) + deLaSemaine.reduce((somme, c) => somme + c.recette, 0),
          depenses: depensesDeSemaine(s.id),
          productions: {
            nombre: faites.length + (ici ? 1 : 0),
            sacs: faites.reduce((somme, p) => somme + p.sacs, 0) + (ici ? enCours!.sacs : 0),
          },
          ecartCumule: deLaSemaine.filter((c) => !c.enCours).reduce((n, c) => n + ecartDe(c), 0),
          caisses: deLaSemaine.length,
          receptions: receptions[s.id] ?? 0,
        },
      ];
    }),
  );
}

type CaisseOuverte = { type: Creneau; jour: string; par: string; heure: string };

/** La caisse ouverte de cette semaine, vue des Caisses ou de la Session en cours. */
function caisseOuverteDe(semaine: Semaine, semaines: readonly Semaine[]): CaisseOuverte | null {
  const ici = lectureCaisses().sessions.find(
    (c) => c.enCours && semaineDuJour(semaines, c.jour)?.id === semaine.id,
  );
  if (ici) return { type: ici.type, jour: ici.jour, ...ici.ouverture };
  const comptoir = sessionOuverteDuComptoir();
  return comptoir && semaineDuJour(semaines, comptoir.jour)?.id === semaine.id ? comptoir : null;
}

function controles(semaine: Semaine, semaines: readonly Semaine[]): Controle[] {
  const caisse = caisseOuverteDe(semaine, semaines);
  const productionBloquante = semaineDeLaProduction(semaines) === semaine.id;
  const dettes = clientsSimules().filter((c) => c.solde < 0);
  const enRetard = FACTURES().filter((f) => !f.payee && f.retard);
  const attente = demandesEnAttente();
  return [
    caisse
      ? { cle: 'caisse', niveau: 'bloquant', session: caisse }
      : { cle: 'caisse', niveau: 'ok' },
    {
      cle: 'production',
      niveau: productionBloquante ? 'bloquant' : 'ok',
      responsable: semaine.production?.nom ?? '—',
    },
    {
      cle: 'dettes',
      niveau: dettes.length ? 'surveiller' : 'ok',
      clients: dettes.length,
      montant: -dettes.reduce((somme, c) => somme + c.solde, 0),
    },
    {
      cle: 'factures',
      niveau: enRetard.length ? 'surveiller' : 'ok',
      factures: enRetard.map(({ numero, libelle }) => ({ numero, libelle })),
    },
    {
      cle: 'demandes',
      niveau: attente.length ? 'surveiller' : 'ok',
      numeros: attente.map((d) => d.numero),
    },
  ];
}

function passation(semaine: Semaine, semaines: readonly Semaine[]): Passation {
  const suivante = semaines[semaines.findIndex((s) => s.id === semaine.id) + 1];
  const { sessions, reouverture } = lectureCaisses();
  const fermees = sessions.filter(
    (c) => !c.enCours && semaineDuJour(semaines, c.jour)?.id === semaine.id,
  );
  const derniere = fermees[fermees.length - 1];
  const dettes = clientsSimules().filter((c) => c.solde < 0);
  const reouvertures = [reouverture, reouvertureDeSession()].flatMap((r) =>
    r ? [{ genre: 'reouverture', par: r.par, heure: r.heure } as const] : [],
  );
  const incidents: Incident[] = [
    ...productionsRattachees()
      .historique.filter((p) => semaineDuJour(semaines, p.date)?.id === semaine.id)
      .flatMap((p): Incident[] => [
        ...(p.motif
          ? [{ genre: 'ecart-matiere', par: p.responsable, motif: p.motif } as const]
          : []),
        ...(p.note
          ? [{ genre: 'production', jour: p.date, creneau: p.type, note: p.note } as const]
          : []),
      ]),
    ...demandesEnAttente().map((d): Incident => ({
      genre: 'demande',
      numero: d.numero,
      titre: d.titre,
      ...(d.titreEn ? { titreEn: d.titreEn } : {}),
    })),
    ...reouvertures,
  ];
  return {
    numeroSuivante: suivante?.numero ?? null,
    destinataire: suivante?.gerant ?? null,
    caisses: {
      derniere: derniere
        ? { jour: derniere.jour, par: derniere.caissiere.nom, compte: derniere.compte ?? 0 }
        : null,
      ecartCumule: fermees.reduce((somme, c) => somme + ecartDe(c), 0),
    },
    dettes: {
      clients: dettes.reduce((somme, c) => somme + c.solde, 0),
      fournisseurs: FACTURES()
        .filter((f) => !f.payee)
        .reduce((somme, f) => somme + f.montant, 0),
    },
    stockBas: matieresSousLeBesoin(productionsRattachees().enCours?.sacs ?? SACS_SANS_PLAN),
    incidents: incidents.slice(0, 6),
  };
}

type Acteur = { id: string; nom: string; profil: Profil };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur || !droitsSemaines(utilisateur.profil).voir) return undefined;
  return { id: utilisateur.id, nom: utilisateur.nom, profil: utilisateur.profil };
}

function instantane(a: Acteur): InstantaneSemaines {
  const semaines = lireSemaines();
  const clotures: Record<string, Cloture> = {};
  for (const s of semaines.filter((x) => x.statut === 'ouverte')) {
    clotures[s.id] = { controles: controles(s, semaines), passation: passation(s, semaines) };
  }
  return {
    moi: comme(a.id, a.nom),
    semaines,
    gerants: comptes('gerant'),
    responsables: comptes('production'),
    caissieres: comptes('caissier'),
    planning: lirePlanning(),
    creneaux: creneauxReels(semaines),
    indicateurs: indicateurs(semaines),
    clotures,
  };
}

const texte = (valeur: unknown) => (typeof valeur === 'string' ? valeur : '');
const trouverSemaine = (id: unknown) => lireSemaines().find((s) => s.id === id);
const estGerantDe = (s: Semaine, a: Acteur) => a.profil === 'gerant' && s.gerant?.id === a.id;

function affecterPersonne(a: Acteur, corps: Corps): Response {
  if (a.profil !== 'proprietaire') return refus();
  const s = trouverSemaine(corps.semaine);
  if (!s) return probleme(404, 'semaine_inconnue', 'Semaine inconnue.');
  if (s.statut !== 'planifiee') {
    return probleme(
      409,
      'semaine_non_planifiee',
      'Seule une semaine planifiée peut changer de gérant ou de responsable.',
    );
  }
  const role = corps.role;
  if (role !== 'gerant' && role !== 'production') {
    return probleme(400, 'role_invalide', 'Choisissez le gérant ou le responsable de production.');
  }
  const id = texte(corps.personne);
  if (id && personne(id)?.profil !== role) {
    return probleme(
      400,
      'personne_invalide',
      role === 'gerant' ? 'Choisissez un gérant.' : 'Choisissez un responsable de production.',
    );
  }
  const avant = (role === 'gerant' ? s.gerant : s.production)?.nom ?? 'aucun';
  affecter(s.id, role, id);
  marquerPlanifiee(s.id, a.nom);
  tracer(
    a.nom,
    `Affectation semaine ${s.numero} : ${role === 'gerant' ? 'gérant' : 'responsable de production'} → ${personne(id)?.nom ?? 'aucun'}`,
    { avant, apres: personne(id)?.nom ?? 'aucun' },
  );
  return Response.json(instantane(a));
}

function planifier(a: Acteur, corps: Corps): Response {
  if (a.profil !== 'proprietaire' && a.profil !== 'gerant') return refus();
  const s = trouverSemaine(corps.semaine);
  if (!s) return probleme(404, 'semaine_inconnue', 'Semaine inconnue.');
  if (a.profil === 'gerant' && !estGerantDe(s, a)) return refus();
  if (!peutPlanifier(a.profil, s, a.nom)) {
    return probleme(409, 'semaine_cloturee', 'Le planning d’une semaine clôturée est figé.');
  }
  const jour = texte(corps.jour);
  const creneau = corps.creneau;
  if (!joursDeLaSemaine(s.du).includes(jour) || (creneau !== 'jour' && creneau !== 'nuit')) {
    return probleme(400, 'creneau_invalide', 'Ce créneau n’existe pas dans la semaine.');
  }
  const id = texte(corps.caissiere);
  if (id && personne(id)?.profil !== 'caissier') {
    return probleme(400, 'caissiere_invalide', 'Choisissez une caissière.');
  }
  if (creneauxReels(lireSemaines()).some((c) => c.jour === jour && c.type === creneau)) {
    return probleme(
      409,
      'creneau_passe',
      'Ce créneau a déjà une caisse : le planning n’y change plus rien.',
    );
  }
  planifierCreneau(s.id, jour, creneau, id);
  tracer(
    a.nom,
    `Planning des caisses · ${jour} (${creneau === 'nuit' ? 'nuit' : 'jour'}) → ${personne(id)?.nom ?? 'non affectée'}`,
  );
  return Response.json(instantane(a));
}

function ouvrir(a: Acteur, corps: Corps): Response {
  if (a.profil !== 'proprietaire' && a.profil !== 'gerant') return refus();
  const semaines = lireSemaines();
  const s = trouverSemaine(corps.semaine);
  if (!s) return probleme(404, 'semaine_inconnue', 'Semaine inconnue.');
  if (s.statut !== 'planifiee') {
    return probleme(409, 'semaine_non_planifiee', 'Cette semaine n’est plus à ouvrir.');
  }
  const raison = raisonOuverture(s, semaines, a.profil, a.nom);
  if (raison?.cle === 'droit') return refus();
  if (raison) {
    return probleme(409, 'ouverture_impossible', 'Cette semaine ne peut pas être ouverte.', {
      raison: raison.cle,
    });
  }
  ouvrirSemaine(s.id, { par: a.nom, jour: dateDuJour(), heure: heureCourante() });
  tracer(
    a.nom,
    `Ouverture de la semaine ${s.numero} · gérant ${s.gerant?.nom} · production ${s.production?.nom}`,
  );
  return Response.json(instantane(a));
}

function cloturer(a: Acteur, corps: Corps): Response {
  if (a.profil !== 'proprietaire' && a.profil !== 'gerant') return refus();
  const semaines = lireSemaines();
  const s = trouverSemaine(corps.semaine);
  if (!s) return probleme(404, 'semaine_inconnue', 'Semaine inconnue.');
  if (a.profil === 'gerant' && !estGerantDe(s, a)) return refus();
  if (s.statut !== 'ouverte') {
    return probleme(409, 'semaine_non_ouverte', 'Seule une semaine ouverte se clôture.');
  }
  if (aDesBloquants(controles(s, semaines))) {
    return probleme(
      409,
      'controles_bloquants',
      'Fermez la caisse et clôturez la production avant de clôturer la semaine.',
    );
  }
  const suivante = semaines[semaines.findIndex((x) => x.id === s.id) + 1];
  cloturerSemaine(s.id, { par: a.nom, jour: dateDuJour(), heure: heureCourante() });
  tracer(
    a.nom,
    `Clôture de la semaine ${s.numero}${suivante?.gerant ? ` · passation à ${suivante.gerant.nom}` : ''}`,
  );
  return Response.json(instantane(a));
}

/**
 * Routes simulées de « Gestion › Semaines » ; `undefined` quand l'appel n'est pas pour elles.
 * - GET  /api/v1/simulation/gestion/semaines/                      semaines, planning, contrôles
 * - POST …/affectations/    { semaine, role, personne }            propriétaire, semaine planifiée
 * - POST …/planning/        { semaine, jour, creneau, caissiere }  propriétaire ou gérant de la semaine
 * - POST …/ouvrir/          { semaine }                            propriétaire ou gérant affecté
 * - POST …/cloturer/        { semaine }                            propriétaire ou gérant de la semaine
 */
export function repondreSemaines(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return refus();
  switch (`${methode} ${url.pathname.slice(RACINE.length)}`) {
    case 'GET ':
      return Response.json(instantane(a));
    case 'POST affectations/':
      return affecterPersonne(a, corps);
    case 'POST planning/':
      return planifier(a, corps);
    case 'POST ouvrir/':
      return ouvrir(a, corps);
    case 'POST cloturer/':
      return cloturer(a, corps);
    default:
      return undefined;
  }
}
