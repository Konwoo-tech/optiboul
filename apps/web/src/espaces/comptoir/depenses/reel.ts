import {
  budgetsList,
  caissesProchaineRetrieve,
  demandesList,
  depensesList,
  fournisseursList,
  parametresList,
  semainesList,
  toutesLesPages,
  type Budget,
  type Demande,
  type Depense as DepenseServeur,
  type Fournisseur as FournisseurServeur,
  type Parametre,
  type Semaine as SemaineServeur,
} from '@/api';
import type { Creneau } from '@/utils';

import type { Profil } from '../../../profils.ts';
import {
  CATEGORIES,
  MATIERES,
  type Categorie,
  type DemandeDepense,
  type Depense,
  type Fournisseur,
  type InstantaneDepenses,
  type LigneBudget,
  type Matiere,
  type ModeDepense,
  type Semaine,
  type StatutDemande,
  type StatutDepense,
} from './types.ts';

/*
 * Lecture de « Comptoir › Dépenses » sur le vrai serveur. L'écran attend un instantané complet : on le
 * compose à partir de `depenses/`, `budgets/`, `semaines/`, `fournisseurs/`, `demandes/` (type
 * dépense) et de la prochaine session de production. Les écritures du budget (#276) et des demandes
 * (#277) viennent aux étapes suivantes.
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Seuil de validation des dépenses (R8) quand le serveur ne le donne pas à ce profil. */
export const SEUIL_PAR_DEFAUT = 50_000;

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

/** `petit_materiel` (serveur) devient `petit-materiel` (écran). */
export function versCategorie(code: string): Categorie {
  const cle = code.replaceAll('_', '-');
  return (CATEGORIES as readonly string[]).includes(cle) ? (cle as Categorie) : 'extra';
}

/** `petit-materiel` (écran) devient `petit_materiel` (serveur). */
export const versCodeCategorie = (categorie: Categorie) => categorie.replaceAll('-', '_');

const STATUTS: Record<string, StatutDepense> = {
  validee: 'validee',
  en_attente: 'en-attente',
  refusee: 'refusee',
};

export function versStatutDemande(statut: string): StatutDemande {
  if (statut === 'accordee' || statut === 'acceptee') return 'acceptee';
  if (statut === 'refusee') return 'refusee';
  return 'en-attente';
}

export function versSemaine(semaine: SemaineServeur): Semaine {
  return { id: String(semaine.id), numero: semaine.numero, du: semaine.du, au: semaine.au };
}

export function versFournisseur(fournisseur: FournisseurServeur): Fournisseur {
  return {
    id: String(fournisseur.id),
    nom: fournisseur.nom,
    matieres: fournisseur.matieres.filter((m): m is Matiere =>
      (MATIERES as readonly string[]).includes(m),
    ),
  };
}

/** Une dépense du serveur, telle que l'écran la lit. `codeSemaine` : « S46 » d'après la liste des semaines. */
export function versDepense(depense: DepenseServeur, codeSemaine: (id: number) => string): Depense {
  const base = {
    id: String(depense.id),
    numero: depense.numero,
    date: jourDeYaounde(depense.cree_le),
    semaine: codeSemaine(depense.semaine),
    categorie: versCategorie(depense.categorie),
    libelle: depense.libelle,
    montant: depense.montant,
    mode: depense.paye_par as ModeDepense,
    par: depense.auteur,
    parProfil: depense.auteur_profil as Profil,
    statut: STATUTS[depense.statut] ?? 'en-attente',
    photo: Boolean(depense.justificatif),
    // « Marché » est le fournisseur d'un achat au marché : l'écran le montre comme l'absence de fournisseur.
    ...(depense.fournisseur && depense.fournisseur !== 'Marché'
      ? { fournisseur: depense.fournisseur }
      : {}),
  };
  const jour = depense.production_jour ?? depense.cree_le.slice(0, 10);
  const session = {
    type: (depense.production_creneau === 'jour' ? 'jour' : 'nuit') as Creneau,
    date: jour,
  };
  if (depense.rattachement === 'stock') {
    return {
      ...base,
      rattachement: {
        type: 'stock',
        matiere: (MATIERES as readonly string[]).includes(depense.matiere ?? '')
          ? (depense.matiere as Matiere)
          : 'farine',
        quantite: Number(depense.quantite ?? 0),
        session,
      },
    };
  }
  return {
    ...base,
    rattachement:
      depense.rattachement === 'production' ? { type: 'production', session } : { type: 'semaine' },
  };
}

/** Une demande de validation de dépense ; `undefined` pour une demande d'un autre objet. */
export function versDemandeDepense(demande: Demande): DemandeDepense | undefined {
  if (demande.objet_type !== 'depense') return undefined;
  return {
    id: String(demande.id),
    numero: demande.numero,
    depenseId: String(demande.objet_id),
    par: ((demande.emetteur ?? {}) as { nom?: string }).nom ?? '',
    parProfil: demande.emetteur_profil as Profil,
    statut: versStatutDemande(demande.statut),
    emiseA: heureDeYaounde(demande.cree_le),
    decideePar: demande.decide_par_nom ?? '',
    decideeLe: demande.decide_le ? jourDeYaounde(demande.decide_le) : '',
    decideeA: demande.decide_le ? heureDeYaounde(demande.decide_le) : '',
  };
}

export function versBudget(budget: Budget): { mois: string; lignes: LigneBudget[] } {
  const lues =
    (budget as unknown as { lignes?: { categorie: string; budget: number; depense: number }[] })
      .lignes ?? [];
  return {
    mois: (budget as unknown as { mois: string }).mois,
    lignes: lues.map((l) => ({
      categorie: versCategorie(l.categorie),
      budget: l.budget,
      realise: l.depense,
    })),
  };
}

/** Compose l'instantané de l'écran des dépenses à partir des routes du serveur. */
export async function lireDepensesReelles(): Promise<InstantaneDepenses> {
  const [depenses, budget, semaines, fournisseurs, demandes, parametres, prochaine] =
    await Promise.all([
      toutesLesPages<DepenseServeur>(
        (page) => depensesList({ page }) as Promise<Page<DepenseServeur>>,
      ),
      // Le budget est réservé à la direction (403 pour la caisse et la production) : sans lui, l'écran
      // n'affiche pas la section « budget ».
      budgetsList().catch(() => null),
      toutesLesPages<SemaineServeur>(
        (page) => semainesList({ page }) as Promise<Page<SemaineServeur>>,
      ),
      toutesLesPages<FournisseurServeur>(
        (page) => fournisseursList({ page }) as Promise<Page<FournisseurServeur>>,
      ).catch(() => [] as FournisseurServeur[]),
      toutesLesPages<Demande>(
        (page) => demandesList({ type: 'depense', page }) as Promise<Page<Demande>>,
      ).catch(() => [] as Demande[]),
      // Le serveur réserve les paramètres à la direction : sans eux, le seuil par défaut s'applique.
      parametresList().catch(() => null),
      caissesProchaineRetrieve().catch(() => null),
    ]);
  const codes = new Map(semaines.map((s) => [s.id, s.code]));
  const codeSemaine = (id: number) => codes.get(id) ?? `S${id}`;
  const ouverte = semaines.find((s) => s.statut === 'ouverte') ?? semaines.at(-1);
  if (!ouverte) throw new Error('Aucune semaine enregistrée');
  const seuil = ((parametres?.data ?? []) as Parametre[]).find(
    (p) => p.cle === 'seuil_validation_depenses',
  )?.valeur;
  const lu = budget
    ? versBudget(budget.data as unknown as Budget)
    : { mois: new Date().toISOString().slice(0, 7), lignes: [] };
  const prochaineSession = prochaine?.data;
  return {
    mois: lu.mois,
    seuil: typeof seuil === 'number' ? seuil : SEUIL_PAR_DEFAUT,
    semaineCourante: versSemaine(ouverte),
    semaines: semaines.map(versSemaine).sort((a, b) => b.numero - a.numero),
    gerantDeLaSemaine: ouverte.gerant?.nom ?? '',
    session: {
      type: (prochaineSession?.creneau === 'jour' ? 'jour' : 'nuit') as Creneau,
      date: prochaineSession?.jour ?? new Date().toISOString().slice(0, 10),
    },
    budget: lu.lignes,
    depenses: depenses.map((d) => versDepense(d, codeSemaine)).sort((a, b) => b.numero - a.numero),
    demandes: demandes.map(versDemandeDepense).filter((d): d is DemandeDepense => d !== undefined),
    fournisseurs: fournisseurs.map(versFournisseur),
  };
}
