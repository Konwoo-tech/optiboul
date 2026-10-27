import { formaterNombre } from '@/utils';

import type { Profil } from '../../../profils.ts';
import { PRODUITS } from '../../comptoir/session/calculs.ts';
import { CLES_PRODUIT } from '../../comptoir/session/types.ts';
import type {
  Brouillon,
  CleProduit,
  Consommation,
  DemandeEstimee,
  Etape,
  FicheProduit,
  Ingredient,
  Matiere,
  Plan,
  Quantites,
  Realise,
  Recette,
  SortieDeStock,
} from './types.ts';
import { INGREDIENTS } from './types.ts';

/** Poids de pâte d'un sac de farine de 50 kg (50 + 27,4 + 0,6 + 0,45 + 0,3 kg), en grammes. */
export const PATE_PAR_SAC_G = 78_750;

/** Poids d'une boule de pâte de chaque produit, en grammes (fiches techniques). */
export const BOULE_PAR_PRODUIT: Record<CleProduit, number> = { BAG: 5000, KO: 3700, GC: 7300 };

/**
 * Ventes au guichet par session : moyenne des quatre dernières sessions du même type (cahier des
 * charges §5.5, à confirmer au point 7 de la section 10 ; la démonstration prend 120, 60 et 20).
 */
export const GUICHET_MOYEN: Quantites = { BAG: 120, KO: 60, GC: 20 };

/** Écart de matière toléré par sac travaillé, en kg (R10). */
export const SEUIL_ECART_KG_PAR_SAC = 2;

/** Sacs de farine d'une session type : la cuisson (bois et huile) se répartit dessus. */
export const SACS_PAR_SESSION = 8;

/** Un supplément se règle par pas d'un sac, entre 0 et 10 par produit (maquette). */
export const SUPPLEMENT_MAX_PAR_PRODUIT = 10;

const PAINS_PAR_SAC = /* @__PURE__ */ Object.fromEntries(
  PRODUITS.map((p) => [p.cle, p.painsParSac]),
) as Record<CleProduit, number>;

/** Un entier saisi : on ne garde que les chiffres, comme la maquette. Vide : rien de saisi. */
export const chiffresSaisis = (texte: string): string => texte.replace(/\D/g, '');

export function lireSaisie(texte: string): number | null {
  const chiffres = chiffresSaisis(texte);
  return chiffres === '' ? null : Number.parseInt(chiffres, 10);
}

export const texteDeSaisie = (valeur: number | null): string =>
  valeur === null ? '' : String(valeur);

// ───────────────────────────── plan et demande ─────────────────────────────

/** Plan de la session : sacs, pains prévus et boules par produit (R4). */
export function calculerPlan(pains: Quantites, supplement: Quantites): Plan {
  const lignes = {} as Plan['lignes'];
  let sacs = 0;
  let prevus = 0;
  let ajoutes = 0;
  for (const cle of CLES_PRODUIT) {
    const base = Math.ceil(pains[cle] / PAINS_PAR_SAC[cle]);
    const total = base + supplement[cle];
    lignes[cle] = {
      pains: pains[cle],
      base,
      supplement: supplement[cle],
      sacs: total,
      prevus: total * PAINS_PAR_SAC[cle],
      boules: Math.floor((total * PATE_PAR_SAC_G) / BOULE_PAR_PRODUIT[cle]),
    };
    sacs += total;
    prevus += total * PAINS_PAR_SAC[cle];
    ajoutes += supplement[cle];
  }
  return { lignes, sacs, prevus, supplement: ajoutes };
}

/**
 * Origine de la demande : commandes, clients habituels sans commande, guichet (moyenne), puis le
 * nombre de sacs à ajouter pour couvrir la demande estimée (jamais négatif).
 */
export function calculerDemande(
  plan: Plan,
  habituelsSansCommande: Quantites,
  guichet: Quantites = GUICHET_MOYEN,
): DemandeEstimee {
  const demande = {} as DemandeEstimee;
  for (const cle of CLES_PRODUIT) {
    const ligne = plan.lignes[cle];
    const estimee = ligne.pains + habituelsSansCommande[cle] + guichet[cle];
    demande[cle] = {
      commande: ligne.pains,
      habituels: habituelsSansCommande[cle],
      guichet: guichet[cle],
      estimee,
      prevus: ligne.prevus,
      sacs: ligne.sacs,
      supplement: ligne.supplement,
      besoin: Math.max(0, Math.ceil((estimee - ligne.prevus) / PAINS_PAR_SAC[cle])),
    };
  }
  return demande;
}

export const totalSacs = (sacs: Quantites): number =>
  CLES_PRODUIT.reduce((somme, cle) => somme + sacs[cle], 0);

/** Pains qu'il reste à produire par produit : prévu moins réalisé, jamais négatif. */
export function resteAProduire(plan: Plan, realise: Realise): Record<CleProduit, number> {
  const reste = {} as Record<CleProduit, number>;
  for (const cle of CLES_PRODUIT) {
    reste[cle] = Math.max(0, plan.lignes[cle].prevus - (realise[cle] ?? 0));
  }
  return reste;
}

/** Écart en pourcentage du prévu ; 0 quand rien n'était prévu. */
export const pourcentDEcart = (ecart: number, prevu: number): number =>
  prevu ? (ecart / prevu) * 100 : 0;

export type MotEcart = 'ok' | 'surveiller' | 'bloquant';

/** « Conforme » jusqu'à 5 %, « à surveiller » jusqu'à 15 %, au-delà « hors seuil » (maquette). */
export function motDEcart(pourcent: number): MotEcart {
  const absolu = Math.abs(pourcent);
  if (absolu <= 5) return 'ok';
  if (absolu <= 15) return 'surveiller';
  return 'bloquant';
}

// ───────────────────────────── consommation ─────────────────────────────

export type ReglageMatiere = {
  unite: 'kg' | 'g' | 'sachets' | 'chargements' | 'litres';
  /** Quantité théorique par sac travaillé ; absent : quantité fixe de la session. */
  parSac?: number;
  fixe?: number;
  /** Kilogrammes que pèse une unité de saisie ; 0 : la matière n'entre pas dans l'écart en kg. */
  kgParUnite: number;
  /** Unités de stock sorties pour une unité de saisie (farine : kg → sacs de 50 kg). */
  stockParUnite: number;
};

/** Consommation théorique de la recette et conversion vers le stock (maquette : MATS, prodOuts). */
export const MATIERES_PESEES: Record<Matiere, ReglageMatiere> = {
  farine: { unite: 'kg', parSac: 50, kgParUnite: 1, stockParUnite: 1 / 50 },
  sel: { unite: 'g', parSac: 600, kgParUnite: 0.001, stockParUnite: 0.001 },
  levure: { unite: 'g', parSac: 450, kgParUnite: 0.001, stockParUnite: 0.001 },
  ameliorant: { unite: 'g', parSac: 300, kgParUnite: 0.001, stockParUnite: 0.001 },
  glace: { unite: 'sachets', parSac: 5, kgParUnite: 0, stockParUnite: 1 },
  bois: { unite: 'chargements', fixe: 1, kgParUnite: 0, stockParUnite: 1 },
  huile: { unite: 'litres', fixe: 3, kgParUnite: 0, stockParUnite: 1 },
};

export const MATIERES_CONSOMMEES = /* @__PURE__ */ Object.keys(MATIERES_PESEES) as Matiere[];

/** Valeur théorique d'une matière pour ce nombre de sacs. */
export function theorique(matiere: Matiere, sacs: number): number {
  const reglage = MATIERES_PESEES[matiere];
  return reglage.fixe ?? (reglage.parSac ?? 0) * sacs;
}

/** Écart d'une matière saisie, en unités de saisie et en pourcentage du théorique. */
export function ecartDeMatiere(matiere: Matiere, reel: number, sacs: number) {
  const prevu = theorique(matiere, sacs);
  const ecart = reel - prevu;
  return { prevu, ecart, pourcent: pourcentDEcart(ecart, prevu) };
}

/** Écart total des matières pesées (farine, sel, levure, améliorant), en kg et signé. */
export function ecartEnKg(consommation: Consommation, sacs: number): number {
  let kg = 0;
  for (const matiere of MATIERES_CONSOMMEES) {
    const valeur = consommation[matiere];
    const poids = MATIERES_PESEES[matiere].kgParUnite;
    if (valeur !== null && poids) kg += (valeur - theorique(matiere, sacs)) * poids;
  }
  return kg;
}

/** Limite d'écart de la session : seuil par sac × sacs travaillés (R10). */
export const limiteEcartKg = (seuilParSac: number, sacs: number): number => seuilParSac * sacs;

/** L'écart dépasse la limite, dans un sens ou dans l'autre : le chef doit le justifier. */
export const ecartAJustifier = (kg: number, limite: number): boolean => Math.abs(kg) > limite;

export const realiseComplet = (realise: Realise): boolean =>
  CLES_PRODUIT.every((cle) => realise[cle] !== null);

export const consommationComplete = (consommation: Consommation): boolean =>
  MATIERES_CONSOMMEES.every((matiere) => consommation[matiere] !== null);

/** Sorties de stock d'une clôture : la consommation réelle, convertie dans l'unité du stock. */
export function sortiesDeStock(consommation: Consommation): SortieDeStock[] {
  const sorties: SortieDeStock[] = [];
  for (const matiere of MATIERES_CONSOMMEES) {
    const valeur = consommation[matiere];
    if (valeur === null) continue;
    const quantite = Math.round(valeur * MATIERES_PESEES[matiere].stockParUnite * 100) / 100;
    if (quantite > 0) sorties.push({ matiere, quantite });
  }
  return sorties;
}

// ───────────────────────────── droits et cycle ─────────────────────────────

export type Equipe = { responsable: string; gerant: string };

export type DroitsProduction = {
  /** Voir l'écran : le chef de production, le gérant et le propriétaire. */
  voir: boolean;
  /** Responsable de production de la semaine : propose, ouvre, clôture, saisit (§3.3). */
  responsable: boolean;
  /** Valider le plan : le gérant de la semaine ou le propriétaire (R4). */
  validerPlan: boolean;
  /** Modifier une fiche technique : le propriétaire (et l'administrateur, hors atelier). */
  modifierFiches: boolean;
};

export function droitsProduction(
  profil: Profil | null | undefined,
  nom: string | null | undefined,
  equipe: Equipe,
): DroitsProduction {
  return {
    voir: profil === 'production' || profil === 'gerant' || profil === 'proprietaire',
    responsable: profil === 'production' && nom === equipe.responsable,
    validerPlan: (profil === 'gerant' && nom === equipe.gerant) || profil === 'proprietaire',
    modifierFiches: profil === 'proprietaire' || profil === 'administrateur',
  };
}

export type ActionCycle = 'proposer' | 'valider' | 'ouvrir' | 'cloturer';

/** Action de l'étape en cours que cette personne peut faire ; `null` : elle attend les autres. */
export function actionDuCycle(etape: Etape, droits: DroitsProduction): ActionCycle | null {
  switch (etape) {
    case 'commandes':
      return droits.responsable ? 'proposer' : null;
    case 'plan-propose':
      return droits.validerPlan ? 'valider' : null;
    case 'plan-valide':
      return droits.responsable ? 'ouvrir' : null;
    case 'en-cours':
      return droits.responsable ? 'cloturer' : null;
    case 'cloturee':
      return null;
  }
}

/** Réalisé et consommation se saisissent pendant la production, par son responsable. */
export const peutSaisir = (etape: Etape, droits: DroitsProduction): boolean =>
  droits.responsable && etape === 'en-cours';

/** Avant la validation du plan, un supplément s'ajoute ; après, il devient une demande (R15). */
export const supplementEnDemande = (etape: Etape): boolean =>
  etape === 'plan-valide' || etape === 'en-cours';

export const supplementPossible = (
  etape: Etape,
  droits: DroitsProduction,
  demandeEnAttente: boolean,
): boolean => droits.responsable && etape !== 'cloturee' && !demandeEnAttente;

/** Rang de l'étape dans le cycle (0 à 4). */
export const rangDeLEtape = (etape: Etape): number =>
  (['commandes', 'plan-propose', 'plan-valide', 'en-cours', 'cloturee'] as const).indexOf(etape);

export type EtatDeLEtape = 'faite' | 'a-venir' | 'courante';

/**
 * État de chacune des cinq étapes (maquette : `done`, `idx`). Au tout début, rien n'est fait et
 * « Commandes » est l'étape courante ; ensuite, celle qui suit la dernière faite.
 */
export function etatsDesEtapes(etape: Etape): EtatDeLEtape[] {
  const rang = rangDeLEtape(etape);
  const courante = Math.min(rang + (rang === 0 ? 0 : 1), 4);
  return [0, 1, 2, 3, 4].map((i) =>
    rang > 0 && i <= rang ? 'faite' : i === courante ? 'courante' : 'a-venir',
  );
}

// ───────────────────────────── supplément ─────────────────────────────

/** Sacs de farine qu'il faut pour la session, supplément en cours de saisie compris. */
export const besoinEnFarine = (plan: Plan, supplementSaisi: Quantites): number =>
  plan.sacs + totalSacs(supplementSaisi);

export const supplementVide = (): Quantites => ({ BAG: 0, KO: 0, GC: 0 });

export const bornerSupplement = (sacs: number): number =>
  Math.max(0, Math.min(SUPPLEMENT_MAX_PAR_PRODUIT, sacs));

// ───────────────────────────── fiche technique ─────────────────────────────

export const PRIX_UNITAIRE_EAU = 0;

type Ligne = { ingredient: Ingredient; quantite: number; prixUnitaire: number };

export type CalculFiche = {
  lignes: Ligne[];
  /** Pâte obtenue par sac, en kg. */
  pate: number;
  piece: number;
  painsParSac: number;
  boulesParSac: number;
  matieres: number;
  cuisson: number;
  coutDuSac: number;
  coutParPain: number;
  /** Marge par pain à chaque prix relevé ; `null` : aucun prix. */
  marges: [number, number] | null;
};

/** Nombre saisi avec virgule ou point ; 0 si illisible. */
export function nombreSaisi(texte: string): number {
  const valeur = Number.parseFloat(texte.replace(',', '.'));
  return Number.isNaN(valeur) ? 0 : valeur;
}

/**
 * Coût de revient d'un pain (maquette : vProduit). La farine est payée au sac de 50 kg, la cuisson
 * (bois et huile) est répartie sur les sacs d'une session type.
 */
export function calculerFiche(
  recette: Recette,
  prix: Record<Matiere, number>,
  prixDeVente: FicheProduit['prix'],
): CalculFiche {
  const unitaire: Record<Ingredient, number> = {
    farine: prix.farine / 50,
    eau: PRIX_UNITAIRE_EAU,
    sel: prix.sel,
    levure: prix.levure,
    ameliorant: prix.ameliorant,
    glace: prix.glace,
  };
  const lignes = INGREDIENTS.map((ingredient) => ({
    ingredient,
    quantite: recette[ingredient],
    prixUnitaire: unitaire[ingredient],
  }));
  const pains = Math.max(1, Math.round(recette.pb));
  const pate = recette.farine + recette.eau + recette.sel + recette.levure + recette.ameliorant;
  const piece = recette.boule / pains;
  const painsParSac = piece > 0 ? Math.round((pate * 1000) / piece) : 0;
  const boulesParSac = recette.boule > 0 ? (pate * 1000) / recette.boule : 0;
  const matieres = lignes.reduce((somme, l) => somme + l.quantite * l.prixUnitaire, 0);
  const cuisson = (prix.bois + 3 * prix.huile) / SACS_PAR_SESSION;
  const coutDuSac = matieres + cuisson;
  const coutParPain = painsParSac ? coutDuSac / painsParSac : 0;
  return {
    lignes,
    pate,
    piece,
    painsParSac,
    boulesParSac,
    matieres,
    cuisson,
    coutDuSac,
    coutParPain,
    marges: prixDeVente ? [prixDeVente[0] - coutParPain, prixDeVente[1] - coutParPain] : null,
  };
}

/** Champs d'une fiche qui doivent rester strictement positifs (l'eau et la glace peuvent être nulles). */
export const CHAMPS_POSITIFS = ['boule', 'pb', 'farine', 'sel', 'levure', 'ameliorant'] as const;

export function champInvalide(recette: Record<string, number>): string | undefined {
  return CHAMPS_POSITIFS.find((cle) => !((recette[cle] ?? 0) > 0));
}

// ───────────────────────────── affichage des nombres ─────────────────────────────

/**
 * « 1 234,5 » en français, « 1 234.5 » en anglais : partie entière groupée par espaces insécables,
 * comme `dec` de la maquette (l'arrondi se fait avant la coupe).
 */
export function decimal(valeur: number, chiffres: number, langue: string): string {
  const [entier = '0', fraction] = String(Number(valeur.toFixed(chiffres))).split('.');
  return `${formaterNombre(Number(entier))}${fraction ? (langue === 'en' ? '.' : ',') + fraction : ''}`;
}

/** Un chiffre après la virgule, signe moins simple comme la maquette (`toFixed`). */
export const unChiffre = (valeur: number, langue: string): string =>
  valeur.toFixed(1).replace('.', langue === 'en' ? '.' : ',');

/** Valeurs saisies sous forme de consommation : `null` pour un champ vide. */
export function consommationSaisie(valeurs: Brouillon<Matiere>): Consommation {
  return Object.fromEntries(
    MATIERES_CONSOMMEES.map((matiere) => [matiere, lireSaisie(valeurs[matiere])]),
  ) as Consommation;
}

export const brouillonDeConsommation = (consommation: Consommation): Brouillon<Matiere> =>
  Object.fromEntries(
    MATIERES_CONSOMMEES.map((matiere) => [matiere, texteDeSaisie(consommation[matiere])]),
  ) as Brouillon<Matiere>;

export const brouillonDuRealise = (realise: Realise): Brouillon<CleProduit> => ({
  BAG: texteDeSaisie(realise.BAG),
  KO: texteDeSaisie(realise.KO),
  GC: texteDeSaisie(realise.GC),
});

export const realiseSaisi = (brouillon: Brouillon<CleProduit>): Realise => ({
  BAG: lireSaisie(brouillon.BAG),
  KO: lireSaisie(brouillon.KO),
  GC: lireSaisie(brouillon.GC),
});
