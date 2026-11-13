import type { Creneau } from '@/utils';

import type { CleEcran } from '../../../navigation.ts';
import type { Espace } from '../../../profils.ts';
import type { MotifEcart } from '../../atelier/production/types.ts';
import type { Categorie, Matiere } from '../../comptoir/depenses/types.ts';

/** Urgent (rouge) ou à voir (ambre) : le mot est toujours écrit, jamais la couleur seule. */
export type NiveauAlerte = 'bloquant' | 'surveiller';

/** Écran que l'alerte ouvre, avec le filtre ou l'onglet qui montre le détail. */
export type DestinationAlerte = {
  espace: Espace;
  ecran: CleEcran;
  parametres?: Record<string, string>;
};

/** Les neuf types d'alertes de la maquette (cahier des charges §5.11), tous émis par le faux serveur. */
export type Alerte = {
  id: string;
  niveau: NiveauAlerte;
  destination: DestinationAlerte;
} & (
  | { type: 'facture-en-retard'; numero: string; montant: number }
  | { type: 'stock-bas'; matiere: Matiere }
  | { type: 'clients-au-dela-du-plafond'; clients: number; plafond: number }
  | { type: 'budget-depasse'; categorie: Categorie }
  | { type: 'production-non-cloturee'; jour: string; creneau: Creneau }
  | { type: 'manquant-fournisseur'; commande: string; matiere: Matiere; manque: number }
  | { type: 'manque-de-caisse'; jour: string; creneau: Creneau; caissiere: string; ecart: number }
  | { type: 'demandes-en-attente'; nombre: number }
  | { type: 'ecart-matiere'; par: string; motif: MotifEcart }
  /** Alerte du vrai serveur : le titre et le détail sont déjà rédigés. */
  | { type: 'serveur'; titre: string; detail: string; nombre: number }
);

export type TypeAlerte = Alerte['type'];

/** Recette encaissée un jour de session (la dernière barre est la session en cours). */
export type RecetteDeNuit = {
  /** Jour de la session, « AAAA-MM-JJ ». */
  jour: string;
  /** Entiers FCFA. */
  montant: number;
};

export type ProductionDuProduit = {
  /** Code du produit, affiché tel quel (« BAG », « GC 135 »). */
  produit: string;
  /** Pains produits depuis le début du mois. */
  pains: number;
};

/** Tout ce que l'écran affiche, tel que le serveur le renvoie (montants en entiers FCFA). */
export type InstantaneTableauDeBord = {
  /** Mois affiché, « AAAA-MM ». */
  mois: string;
  recette: {
    /** Encaissé depuis le début du mois. */
    encaissee: number;
    /** Dû depuis le début du mois (le taux d'encaissement est encaissé ÷ dû). */
    due: number;
  };
  dettesClients: {
    /** Montant que les clients doivent (positif). */
    montant: number;
    clients: number;
    auDessusDuPlafond: number;
  };
  dettesFournisseurs: { montant: number; facturesEnRetard: number };
  /** Semaine en cours, avec son gérant et son responsable de production. */
  semaine: {
    numero: number;
    /** Premier et dernier jour, « AAAA-MM-JJ ». */
    du: string;
    au: string;
    gerant: string;
    production: string;
  };
  /** Du plus ancien au plus récent ; le dernier est la session en cours. */
  recettesParNuit: RecetteDeNuit[];
  production: ProductionDuProduit[];
  /** Les plus urgentes d'abord, dans l'ordre de la maquette. */
  alertes: Alerte[];
  /** Marge estimée du mois (vrai serveur) : recette − matières − charges. Absent en simulation. */
  marge?: { matieres: number; charges: number; marge: number };
  /** Budget du mois par catégorie (vrai serveur). Absent en simulation. */
  budget?: { categorie: Categorie; budget: number; realise: number }[];
};
