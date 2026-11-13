import {
  caissesProchaineRetrieve,
  commandesList,
  demandesList,
  mouvementsStockStockRetrieve,
  productionsEnCoursRetrieve,
  productionsPlanRetrieve,
  productionsResteAProduireRetrieve,
  semainesList,
  toutesLesPages,
  type Demande,
  type Semaine,
} from '@/api';
import type { Creneau } from '@/utils';

import {
  CLES_PRODUIT,
  type CleProduit,
  type Consommation,
  type DemandeEstimee,
  type DemandeProduction,
  type Etape,
  type InstantaneProduction,
  type LigneDemande,
  type LignePlan,
  type Matiere,
  type MotifSupplement,
  type Plan,
  type Quantites,
  type Realise,
} from './types.ts';

/*
 * Lecture de « Atelier › Production » sur le vrai serveur : `productions/plan/`, `en-cours/`,
 * `reste-a-produire/`, les commandes de la session, la semaine ouverte, le stock et les demandes de
 * supplément. Le serveur ne liste pas les productions passées : l'historique reste vide (E39).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Les produits de l'écran : les codes du serveur, `GC135` devenant « GC » (voir E17). */
const CODE_DU_PRODUIT: Record<string, CleProduit> = { BAG: 'BAG', KO: 'KO', GC135: 'GC' };
export const CODE_SERVEUR: Record<CleProduit, string> = { BAG: 'BAG', KO: 'KO', GC: 'GC135' };

const MATIERES_SUIVIES: readonly Matiere[] = [
  'farine',
  'sel',
  'levure',
  'ameliorant',
  'glace',
  'bois',
  'huile',
];
const estMatiere = (code: string): code is Matiere =>
  (MATIERES_SUIVIES as readonly string[]).includes(code);

/** Kilos de farine dans un sac : le stock de l'écran compte la farine en sacs. */
const KG_PAR_SAC = 50;

const FUSEAU = 'Africa/Douala';
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

type LignePlanServeur = {
  code: string;
  pains_par_sac: number;
  commandes: number;
  habituels: number;
  guichet: number;
  estimee: number;
  base: number;
  supplement: number;
  besoin: number;
  sacs: number;
  prevus: number;
  boules: number;
};
type PlanServeur = {
  jour: string;
  creneau: string;
  statut: string | null;
  valide_par: string;
  valide_le: string | null;
  lignes: LignePlanServeur[];
};
type ProduitServeur = {
  code: string;
  sacs: number;
  prevus: number;
  realise: number;
  reste: number;
};
type EnCoursServeur = {
  id: number;
  statut: string;
  produits: ProduitServeur[];
  consommation: {
    matiere: string;
    theorique: string;
    reelle: string | null;
    justification: string;
  }[];
  prevus: number;
  realise: number;
};

/** Plan et demande estimée par produit de l'écran, d'après les lignes du serveur. */
export function versPlan(lignes: readonly LignePlanServeur[]): {
  plan: Plan;
  demande: DemandeEstimee;
} {
  const plan = {} as Record<CleProduit, LignePlan>;
  const demande = {} as Record<CleProduit, LigneDemande>;
  for (const cle of CLES_PRODUIT) {
    const l = lignes.find((x) => CODE_DU_PRODUIT[x.code] === cle);
    plan[cle] = {
      pains: l?.commandes ?? 0,
      base: l?.base ?? 0,
      supplement: l?.supplement ?? 0,
      sacs: l?.sacs ?? 0,
      prevus: l?.prevus ?? 0,
      boules: l?.boules ?? 0,
    };
    demande[cle] = {
      commande: l?.commandes ?? 0,
      habituels: l?.habituels ?? 0,
      guichet: l?.guichet ?? 0,
      estimee: l?.estimee ?? 0,
      prevus: l?.prevus ?? 0,
      sacs: l?.sacs ?? 0,
      supplement: l?.supplement ?? 0,
      besoin: l?.besoin ?? 0,
    };
  }
  const somme = (champ: keyof LignePlan) => CLES_PRODUIT.reduce((s, c) => s + plan[c][champ], 0);
  return {
    plan: {
      lignes: plan,
      sacs: somme('sacs'),
      prevus: somme('prevus'),
      supplement: somme('supplement'),
    },
    demande,
  };
}

/** Le cycle de la session : commandes, plan proposé, plan validé, en cours, clôturée. */
export function etapeDe(plan: string | null, production: string | undefined): Etape {
  if (production === 'cloturee' || production === 'non_cloturee') return 'cloturee';
  if (production === 'ouverte') return 'en-cours';
  if (plan === 'valide' || plan === 'provisoire') return 'plan-valide';
  if (plan === 'propose') return 'plan-propose';
  return 'commandes';
}

export function versRealise(produits: readonly ProduitServeur[]): Realise {
  const realise = { BAG: null, KO: null, GC: null } as Realise;
  for (const p of produits) {
    const cle = CODE_DU_PRODUIT[p.code];
    if (cle && p.realise > 0) realise[cle] = p.realise;
  }
  return realise;
}

export function versConsommation(lignes: EnCoursServeur['consommation']): Consommation {
  const consommation = Object.fromEntries(MATIERES_SUIVIES.map((m) => [m, null])) as Consommation;
  for (const l of lignes) {
    if (estMatiere(l.matiere) && l.reelle !== null) consommation[l.matiere] = Number(l.reelle);
  }
  return consommation;
}

/** Une demande de supplément en attente, d'après la liste des demandes. */
export function versDemandeProduction(demande: Demande): DemandeProduction | undefined {
  if (demande.type !== 'supplement' || demande.statut !== 'en_attente') return undefined;
  const sacs = ((demande.details ?? {}) as { sacs?: Record<string, number> }).sacs ?? {};
  const supplement = { BAG: 0, KO: 0, GC: 0 } as Quantites;
  for (const [code, n] of Object.entries(sacs)) {
    const cle = CODE_DU_PRODUIT[code];
    if (cle) supplement[cle] = n;
  }
  const motif = ((demande.details ?? {}) as { motif?: string }).motif;
  return {
    id: String(demande.id),
    numero: demande.numero,
    supplement,
    total: Object.values(supplement).reduce((a, b) => a + b, 0),
    motif: (['habituels', 'guichet', 'marche', 'tardive'].includes(motif ?? '')
      ? motif
      : 'habituels') as MotifSupplement,
  };
}

/** Compose l'instantané de l'écran de production à partir des routes du serveur. */
export async function lireProductionReelle(): Promise<InstantaneProduction> {
  const plan = (await productionsPlanRetrieve()).data as unknown as PlanServeur;
  const session = { jour: plan.jour, creneau: plan.creneau as never };
  const [enCours, reste, semaines, commandes, stock, demandes, prochaine] = await Promise.all([
    productionsEnCoursRetrieve(session)
      .then((r) => r.data as unknown as EnCoursServeur)
      .catch(() => null),
    productionsResteAProduireRetrieve(session)
      .then((r) => r.data as unknown as { produits: ProduitServeur[] })
      .catch(() => null),
    toutesLesPages<Semaine>((page) => semainesList({ page }) as Promise<Page<Semaine>>),
    commandesList({ jour: plan.jour, creneau: plan.creneau as never })
      .then((r) => r.data as unknown as unknown[])
      .catch(() => [] as unknown[]),
    mouvementsStockStockRetrieve()
      .then((r) => (r.data as unknown as { quantites: Record<string, string> }).quantites)
      .catch(() => ({}) as Record<string, string>),
    toutesLesPages<Demande>(
      (page) => demandesList({ type: 'supplement', page }) as Promise<Page<Demande>>,
    ).catch(() => [] as Demande[]),
    caissesProchaineRetrieve().catch(() => null),
  ]);
  const ouverte = semaines.find((s) => s.statut === 'ouverte') ?? semaines.at(-1);
  const { plan: lignes, demande } = versPlan(plan.lignes);
  const produits = enCours?.produits ?? reste?.produits ?? [];
  const valide = plan.valide_par
    ? { par: plan.valide_par, a: plan.valide_le ? heureDeYaounde(plan.valide_le) : '' }
    : null;
  const etape = etapeDe(plan.statut, enCours?.statut);
  const responsable = ouverte?.production?.nom ?? '';
  const quantites = stock as Record<string, string>;
  return {
    session: { type: (plan.creneau === 'jour' ? 'jour' : 'nuit') as Creneau, date: plan.jour },
    semaine: { numero: ouverte?.numero ?? 0, du: ouverte?.du ?? '', au: ouverte?.au ?? '' },
    gerant: ouverte?.gerant?.nom ?? '',
    responsable,
    caissiere:
      prochaine?.data.planifiee?.nom ?? prochaine?.data.caisse_en_cours?.caissiere.nom ?? '',
    etape,
    // Le serveur ne dit pas qui a proposé le plan ni quand : le responsable de production le fait.
    planPropose: plan.statut ? { par: responsable, a: '' } : null,
    planValide: valide,
    ouverte: enCours ? { par: responsable, a: '' } : null,
    cloturee: etape === 'cloturee' ? { par: responsable, a: '' } : null,
    clientsCommandes: commandes.length,
    plan: lignes,
    demande,
    realise: versRealise(produits),
    consommation: versConsommation(enCours?.consommation ?? []),
    justification: null,
    // La tolérance d'écart se règle dans les paramètres (réservés au propriétaire) : valeur par défaut.
    seuilEcartKg: 0.5,
    stock: Object.fromEntries(
      MATIERES_SUIVIES.map((m) => [
        m,
        m === 'farine' ? Number(quantites[m] ?? 0) / KG_PAR_SAC : Number(quantites[m] ?? 0),
      ]),
    ) as Record<Matiere, number>,
    demandeEnAttente:
      demandes.map((d) => versDemandeProduction(d)).find((d) => d !== undefined) ?? null,
    // Le serveur ne liste pas les productions passées.
    historique: [],
    ...(enCours ? { productionId: String(enCours.id) } : {}),
  };
}
