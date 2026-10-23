import type { Creneau } from '@/utils';

import type { Matiere } from '../../comptoir/depenses/types.ts';

export { MATIERES, type Matiere } from '../../comptoir/depenses/types.ts';

/** Types de mouvement : la perte et l'entrée de correction sont saisies à la main (§5.6). */
export const TYPES_MOUVEMENT = ['entree', 'sortie', 'ajustement', 'perte'] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

/** Ce que le gérant ou le chef de production peut saisir à la main. */
export const TYPES_SAISIS = ['perte', 'entree'] as const;
export type TypeSaisi = (typeof TYPES_SAISIS)[number];

/** D'où vient un mouvement : le texte affiché sous la matière est construit à partir de là. */
export type OrigineMouvement =
  /** Achat rattaché au stock (écran Dépenses) : en caisse, au marché ou chez un fournisseur. */
  | {
      genre: 'depense';
      code: string;
      achat: 'caisse' | 'marche' | 'fournisseur';
      fournisseur?: string;
    }
  /** Sortie créée par la clôture d'une production (R5). */
  | { genre: 'production'; creneau: Creneau; date: string }
  /** Réception d'un bon de commande, éventuellement partielle. */
  | { genre: 'reception'; code: string; fournisseur: string; partielle: boolean }
  /** Ajustement d'un inventaire validé. */
  | { genre: 'inventaire'; code: string; date: string }
  | { genre: 'manuel'; motif: string };

export type Mouvement = {
  id: string;
  /** Jour du mouvement, « AAAA-MM-JJ ». */
  jour: string;
  /** Heure du mouvement, « HH:MM ». */
  heure: string;
  type: TypeMouvement;
  matiere: Matiere;
  /** Positive, dans l'unité de la matière ; seul l'ajustement est signé. */
  quantite: number;
  origine: OrigineMouvement;
  par: string;
};

export type FicheMatiere = {
  cle: Matiere;
  stock: number;
  /** Besoin d'une session, dans l'unité de la matière. */
  besoin: number;
  /** Prix unitaire, entiers FCFA. */
  prix: number;
};

/** Réception fournisseur planifiée : « Prochaine réception » de l'état du stock. */
export type ReceptionPlanifiee = {
  matiere: Matiere;
  /** Jour prévu, « AAAA-MM-JJ ». */
  jour: string;
  quantite: number;
};

export const STATUTS_INVENTAIRE = ['valide', 'a-valider', 'refuse'] as const;
export type StatutInventaire = (typeof STATUTS_INVENTAIRE)[number];

export type LigneInventaire = {
  matiere: Matiere;
  /** Stock théorique au moment du comptage. */
  theorique: number;
  compte: number;
};

export type Inventaire = {
  id: string;
  /** Numéro affiché « AUD-07 ». */
  numero: number;
  /** Jour du comptage, « AAAA-MM-JJ ». */
  jour: string;
  /** Heure du comptage, « HH:MM ». */
  heure: string;
  par: string;
  statut: StatutInventaire;
  validePar: string;
  lignes: LigneInventaire[];
  /** Demande au propriétaire quand l'écart dépasse la tolérance. */
  demandeNumero?: number;
};

export type MomentDeControle = 'mercredi' | 'dimanche';

/** Un des deux contrôles obligatoires de la semaine (R16). */
export type Controle = {
  /** Numéro de la semaine, « 42 ». */
  semaine: number;
  jour: string;
  moment: MomentDeControle;
  gerant: string;
  responsableProduction: string;
};

/** Tout ce que l'écran affiche, tel que le serveur le renvoie. */
export type InstantaneStocks = {
  /** Jour courant, « AAAA-MM-JJ ». */
  aujourdhui: string;
  /** Sacs de farine par session sur lesquels le besoin est calculé. */
  sacsParSession: number;
  matieres: FicheMatiere[];
  receptions: ReceptionPlanifiee[];
  /** Plus récents d'abord. */
  mouvements: Mouvement[];
  /** Plus anciens d'abord. */
  inventaires: Inventaire[];
  controles: Controle[];
};

export type NouveauMouvement = {
  type: TypeSaisi;
  matiere: Matiere;
  quantite: number;
  motif: string;
};

/** Quantités comptées, par matière. */
export type NouvelInventaire = { comptages: Partial<Record<Matiere, number>> };
