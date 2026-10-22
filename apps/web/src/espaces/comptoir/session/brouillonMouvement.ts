import type { CleProduit, TypeMouvement } from './types.ts';

/** Brouillon du formulaire : il vit dans l'écran, pour survivre au changement d'onglet. */
export type BrouillonMouvement = {
  type: TypeMouvement;
  produit: CleProduit;
  quantite: string;
  motif: string;
  /** Clé de traduction de l'erreur affichée sous le motif. */
  erreur: 'erreurQuantite' | 'erreurMotif' | '';
};

export const BROUILLON_VIDE: BrouillonMouvement = {
  type: 'vente-guichet',
  produit: 'BAG',
  quantite: '',
  motif: '',
  erreur: '',
};
