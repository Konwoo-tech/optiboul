/*
 * Les produits que le comptoir vend : ceux du catalogue du serveur (actifs, dans leur ordre), et non
 * plus trois colonnes figées. Un produit créé dans Paramètres apparaît ici dès la lecture suivante.
 *
 * Les clés de l'écran sont les codes du serveur, sauf « GC » qui reste l'écriture historique du
 * « GC135 ». Le catalogue vit dans des listes modifiées sur place : les écrans qui les lisent à
 * l'affichage voient la liste à jour sans changer d'import ; il part avec la lecture de la session.
 */

export type CleProduit = string;

export type Produit = {
  cle: CleProduit;
  /** Libellé affiché dans les en-têtes et les champs. */
  libelle: string;
  /** Pains tirés d'un sac de farine : sert au plan de pétrissage. */
  painsParSac: number;
};

/** Produits d'origine : repris tant que le serveur n'a pas répondu (et dans les essais). */
const PAR_DEFAUT: readonly Produit[] = [
  { cle: 'BAG', libelle: 'BAG', painsParSac: 315 },
  { cle: 'KO', libelle: 'KO', painsParSac: 426 },
  { cle: 'GC', libelle: 'GC 135', painsParSac: 216 },
];

export const PRODUITS: Produit[] = [...PAR_DEFAUT];
export const CLES_PRODUIT: CleProduit[] = PAR_DEFAUT.map((p) => p.cle);

/** Code du serveur d'un produit de l'écran (« GC » est le GC135). */
export const codeServeur = (cle: CleProduit): string => (cle === 'GC' ? 'GC135' : cle);

/** Clé de l'écran d'un code du serveur. */
export const cleDeCode = (code: string): CleProduit => (code === 'GC135' ? 'GC' : code);

/** « GC135 » devient « GC 135 », « C2 » devient « C 2 » : comme sur les fiches techniques. */
const libelleDeCode = (code: string) => code.replace(/^([A-Za-z]+)(\d+)$/, '$1 $2');

type ProduitServeur = {
  code: string;
  actif?: boolean;
  ordre?: number;
  fiche?: { pains_par_sac?: number } | null;
};

/** Remplace le catalogue par les produits actifs du serveur ; sans produit, on garde celui d'avant. */
export function definirCatalogue(produits: readonly ProduitServeur[]) {
  const actifs = produits
    .filter((p) => p.actif !== false)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.code.localeCompare(b.code));
  if (actifs.length === 0) return;
  PRODUITS.splice(
    0,
    PRODUITS.length,
    ...actifs.map((p) => ({
      cle: cleDeCode(p.code),
      // Les trois produits d'origine gardent leur écriture historique.
      libelle: p.code === 'GC135' ? 'GC 135' : libelleDeCode(p.code),
      painsParSac:
        p.fiche?.pains_par_sac ??
        PAR_DEFAUT.find((d) => d.cle === cleDeCode(p.code))?.painsParSac ??
        0,
    })),
  );
  CLES_PRODUIT.splice(0, CLES_PRODUIT.length, ...PRODUITS.map((p) => p.cle));
}

/** Une table à zéro (ou « ») pour chaque produit du catalogue. */
export const parProduit = <T>(valeur: T): Record<CleProduit, T> =>
  Object.fromEntries(CLES_PRODUIT.map((cle) => [cle, valeur]));

/** Quantité ou prix d'un produit dans une table ; 0 pour un produit absent (ajouté depuis). */
export const de = (valeurs: Record<CleProduit, number> | undefined, cle: CleProduit): number =>
  valeurs?.[cle] ?? 0;

/** Somme des quantités de tous les produits du catalogue. */
export const sommeDesPains = (quantites: Record<CleProduit, number>): number =>
  CLES_PRODUIT.reduce((somme, cle) => somme + de(quantites, cle), 0);
