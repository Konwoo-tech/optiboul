import {
  caissesProchaineRetrieve,
  commandesList,
  demandesList,
  mouvementsStockStockRetrieve,
  productionsEnCoursRetrieve,
  productionsList,
  productionsPlanRetrieve,
  productionsResteAProduireRetrieve,
  semainesList,
  toutesLesPages,
  type Demande,
  type ResumeProduction,
  type Semaine,
} from '@/api';
import type { Creneau } from '@/utils';

import { justificationEnvoyee } from './justifications.ts';
import {
  CLES_PRODUIT,
  MOTIFS_ECART,
  type CleProduit,
  type Consommation,
  type DemandeEstimee,
  type DemandeProduction,
  type Etape,
  type InstantaneProduction,
  type LigneHistorique,
  type LigneDemande,
  type LignePlan,
  type Matiere,
  type MotifEcart,
  type MotifSupplement,
  type Plan,
  type Quantites,
  type Realise,
} from './types.ts';

/*
 * Lecture de « Atelier › Production » sur le vrai serveur : `productions/plan/`, `en-cours/`,
 * `reste-a-produire/`, les commandes de la session, la semaine ouverte, le stock et les demandes de
 * supplément. L'historique vient de `productions/?semaine=` ; les jalons du cycle (qui a proposé,
 * ouvert, clôturé, et quand) et la tolérance d'écart viennent du plan et de la production.
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
  propose_par: string;
  propose_le: string | null;
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
type FourneeServeur = { numero: number; produit: string; pains: number; saisie_le: string };
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
  ouverte_par: string;
  ouverte_le: string | null;
  cloturee_par: string;
  cloturee_le: string | null;
  tolerance_ecart_kg: number;
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

/** Un jalon du cycle : qui, et l'heure à Yaoundé ; `repli` quand le serveur ne dit pas qui. */
export const jalonDe = (par: string, quand: string | null, repli = '') =>
  quand || par ? { par: par || repli, a: quand ? heureDeYaounde(quand) : '' } : null;

/**
 * Le motif et la précision d'une justification, telle que l'écran l'envoie (« perte : texte »).
 * Une justification écrite autrement garde le motif « autre ».
 */
export function versJustification(texte: string): { motif: MotifEcart; texte: string } | null {
  if (!texte) return null;
  const [debut, ...reste] = texte.split(' : ');
  const motif = (MOTIFS_ECART as readonly string[]).includes(debut ?? '')
    ? (debut as MotifEcart)
    : null;
  return motif ? { motif, texte: reste.join(' : ') } : { motif: 'autre', texte };
}

/** Une ligne de l'historique des productions d'une semaine (le serveur donne la plus récente d'abord). */
export function versHistorique(productions: readonly ResumeProduction[]): LigneHistorique[] {
  return productions
    .filter((p) => p.statut !== 'en_cours')
    .map((p) => {
      const justification = versJustification(p.motif_ecart);
      return {
        id: String(p.id),
        date: p.jour,
        type: (p.creneau === 'jour' ? 'jour' : 'nuit') as Creneau,
        responsable: p.responsable.nom,
        validePar: p.plan_valide_par || '—',
        ouvertA: heureDeYaounde(p.ouverte_le),
        clotureA: p.cloturee_le ? heureDeYaounde(p.cloturee_le) : '—',
        sacs: p.sacs,
        prevus: p.prevus,
        realise: p.realise > 0 ? p.realise : null,
        ecartKg: Number(p.ecart_matiere_kg ?? 0),
        statut: p.statut === 'cloturee' ? ('cloturee' as const) : ('non-cloturee' as const),
        ...(justification ? { motif: justification.motif } : {}),
      };
    })
    .reverse();
}

/** La fournée au plus grand numéro : le serveur n'annule que celle-là. */
export function derniereFourneeDe(
  fournees: readonly FourneeServeur[],
): InstantaneProduction['derniereFournee'] {
  const derniere = fournees.reduce<FourneeServeur | null>(
    (a, f) => (!a || f.numero > a.numero ? f : a),
    null,
  );
  const cle = derniere ? CODE_DU_PRODUIT[derniere.produit] : undefined;
  return derniere && cle
    ? {
        numero: derniere.numero,
        produit: cle,
        pains: derniere.pains,
        a: heureDeYaounde(derniere.saisie_le),
      }
    : null;
}

/** Le cycle de la session : commandes, plan proposé, plan validé, en cours, clôturée. */
export function etapeDe(plan: string | null, production: string | undefined): Etape {
  if (production === 'cloturee' || production === 'non_cloturee') return 'cloturee';
  if (production === 'en_cours') return 'en-cours';
  if (plan === 'valide' || plan === 'provisoire') return 'plan-valide';
  if (plan === 'propose') return 'plan-propose';
  return 'commandes';
}

export function versRealise(produits: readonly ProduitServeur[]): Realise {
  const realise = { BAG: null, KO: null, GC: null } as Realise;
  for (const p of produits) {
    const cle = CODE_DU_PRODUIT[p.code];
    // Un produit que le plan ne prévoit pas n'a rien à saisir : son réalisé est 0, pas « à saisir ».
    if (cle) realise[cle] = p.realise > 0 ? p.realise : p.prevus === 0 ? 0 : null;
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
      .then((r) => r.data as unknown as { produits: ProduitServeur[]; fournees?: FourneeServeur[] })
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
  const passees = ouverte
    ? await toutesLesPages<ResumeProduction>(
        (page) => productionsList({ semaine: ouverte.id, page }) as Promise<Page<ResumeProduction>>,
      ).catch(() => [] as ResumeProduction[])
    : [];
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
    planPropose: plan.statut ? jalonDe(plan.propose_par, plan.propose_le, responsable) : null,
    planValide: valide,
    ouverte: enCours ? jalonDe(enCours.ouverte_par, enCours.ouverte_le, responsable) : null,
    cloturee:
      etape === 'cloturee' && enCours
        ? jalonDe(enCours.cloturee_par, enCours.cloturee_le, responsable)
        : null,
    clientsCommandes: commandes.length,
    plan: lignes,
    demande,
    realise: versRealise(produits),
    consommation: versConsommation(enCours?.consommation ?? []),
    justification:
      versJustification(enCours?.consommation.find((l) => l.justification)?.justification ?? '') ??
      justificationEnvoyee(enCours ? String(enCours.id) : undefined),
    // Tolérance réglée dans les paramètres, que le serveur redit avec la production.
    seuilEcartKg: enCours?.tolerance_ecart_kg ?? 0.5,
    stock: Object.fromEntries(
      MATIERES_SUIVIES.map((m) => [m, Number(quantites[m] ?? 0)]),
    ) as Record<Matiere, number>,
    demandeEnAttente:
      demandes.map((d) => versDemandeProduction(d)).find((d) => d !== undefined) ?? null,
    historique: versHistorique(passees),
    ...(enCours ? { productionId: String(enCours.id) } : {}),
    derniereFournee: enCours ? derniereFourneeDe(reste?.fournees ?? []) : null,
  };
}
