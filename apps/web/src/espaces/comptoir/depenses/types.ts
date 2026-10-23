import type { Creneau } from '@/utils';

import type { Profil } from '../../../profils.ts';

/** Catégories budgétaires, dans l'ordre de la maquette (cahier des charges §5.8). */
export const CATEGORIES = [
  'matieres',
  'salaires',
  'electricite',
  'eau',
  'administration',
  'technique',
  'petit-materiel',
  'lait',
  'extra',
] as const;
export type Categorie = (typeof CATEGORIES)[number];

/** Payé par : la caisse, la banque ou un compte de mobile money. */
export const MODES_DEPENSE = ['caisse', 'banque', 'mobile'] as const;
export type ModeDepense = (typeof MODES_DEPENSE)[number];

/** Rattachement obligatoire d'une dépense : production en cours, semaine ou entrée de stock. */
export const TYPES_RATTACHEMENT = ['production', 'semaine', 'stock'] as const;
export type TypeRattachement = (typeof TYPES_RATTACHEMENT)[number];

export const STATUTS_DEPENSE = ['validee', 'en-attente', 'refusee'] as const;
export type StatutDepense = (typeof STATUTS_DEPENSE)[number];

/** Matières que l'on peut faire entrer en stock par une dépense. */
export const MATIERES = [
  'farine',
  'sel',
  'levure',
  'ameliorant',
  'glace',
  'bois',
  'huile',
] as const;
export type Matiere = (typeof MATIERES)[number];

/** Session de production à laquelle une dépense est rattachée. */
export type SessionRattachee = { type: Creneau; date: string };

export type Rattachement =
  | { type: 'production'; session: SessionRattachee }
  | { type: 'semaine' }
  | {
      type: 'stock';
      matiere: Matiere;
      /** Quantité entrée en stock, dans l'unité de la matière. */
      quantite: number;
      session: SessionRattachee;
    };

export type Depense = {
  id: string;
  /** Numéro affiché sous la forme « DEP-0016 ». */
  numero: number;
  /** Jour de la saisie, « AAAA-MM-JJ ». */
  date: string;
  semaine: string;
  categorie: Categorie;
  libelle: string;
  /** Entiers FCFA. */
  montant: number;
  mode: ModeDepense;
  par: string;
  parProfil: Profil;
  statut: StatutDepense;
  photo: boolean;
  rattachement: Rattachement;
  /** Fournisseur de l'entrée de stock ; absent : achat au marché. */
  fournisseur?: string;
};

export type StatutDemande = 'en-attente' | 'acceptee' | 'refusee';

/** Demande de validation d'une dépense au-dessus du seuil (cahier des charges §5.9). */
export type DemandeDepense = {
  id: string;
  /** Numéro affiché sous la forme « DEM-021 ». */
  numero: number;
  depenseId: string;
  par: string;
  parProfil: Profil;
  statut: StatutDemande;
  decideePar: string;
  decideeLe: string;
  decideeA: string;
};

export type LigneBudget = {
  categorie: Categorie;
  /** Budget mensuel, entiers FCFA. */
  budget: number;
  /** Déjà dépensé ce mois-ci : seules les dépenses validées comptent. */
  realise: number;
};

export type Semaine = { id: string; numero: number; du: string; au: string };

export type Fournisseur = { id: string; nom: string; matieres: readonly Matiere[] };

/** Tout ce que l'écran affiche, tel que le serveur le renvoie. */
export type InstantaneDepenses = {
  /** Mois du budget, « AAAA-MM ». */
  mois: string;
  /** Au-dessus de ce montant (inclus), la dépense attend une validation. */
  seuil: number;
  semaineCourante: Semaine;
  semaines: Semaine[];
  gerantDeLaSemaine: string;
  /** Session de production courante : cible du rattachement « Production ». */
  session: SessionRattachee;
  budget: LigneBudget[];
  depenses: Depense[];
  demandes: DemandeDepense[];
  fournisseurs: Fournisseur[];
};

/** Ce que la caissière ou le gérant envoie pour créer une dépense. */
export type NouvelleDepense = {
  categorie: Categorie;
  libelle: string;
  montant: number;
  mode: ModeDepense;
  photo: boolean;
  rattachement: TypeRattachement;
  /** Seulement pour une entrée de stock. */
  matiere?: Matiere;
  quantite?: number;
  /** Identifiant du fournisseur ; absent : achat au marché. */
  fournisseur?: string;
};
