import type { Creneau } from '@/utils';

import type { Matiere } from '../../comptoir/depenses/types.ts';
import { CLES_PRODUIT, type CleProduit, type Quantites } from '../../comptoir/session/types.ts';

export { CLES_PRODUIT };
export type { CleProduit, Matiere, Quantites };

/** Cycle d'une session, dans l'ordre (cahier des charges §5.5). */
export const ETAPES = ['commandes', 'plan-propose', 'plan-valide', 'en-cours', 'cloturee'] as const;
export type Etape = (typeof ETAPES)[number];

export const ONGLETS = ['plan', 'realise', 'consommation'] as const;
export type Onglet = (typeof ONGLETS)[number];

/** Motifs d'un supplément de sacs, dans l'ordre de la maquette (R15). */
export const MOTIFS_SUPPLEMENT = ['habituels', 'guichet', 'marche', 'tardive'] as const;
export type MotifSupplement = (typeof MOTIFS_SUPPLEMENT)[number];

/** Motifs de justification d'un écart de matière (R10). */
export const MOTIFS_ECART = ['perte', 'rate', 'brule', 'pesee', 'autre'] as const;
export type MotifEcart = (typeof MOTIFS_ECART)[number];

/** Un jalon du cycle : qui et à quelle heure (« HH:MM »). */
export type Jalon = { par: string; a: string };

export type LignePlan = {
  /** Pains commandés. */
  pains: number;
  /** Sacs nécessaires aux commandes, arrondis au sac supérieur. */
  base: number;
  /** Sacs ajoutés par le chef de production. */
  supplement: number;
  sacs: number;
  /** Pains prévus : sacs × pains par sac. */
  prevus: number;
  boules: number;
};

export type Plan = {
  lignes: Record<CleProduit, LignePlan>;
  sacs: number;
  prevus: number;
  supplement: number;
};

export type LigneDemande = {
  commande: number;
  /** Clients habituels qui n'ont pas commandé. */
  habituels: number;
  /** Ventes au guichet, moyenne des quatre dernières sessions du même type. */
  guichet: number;
  estimee: number;
  prevus: number;
  sacs: number;
  supplement: number;
  /** Sacs à ajouter pour couvrir la demande estimée. */
  besoin: number;
};

export type DemandeEstimee = Record<CleProduit, LigneDemande>;

/** Réalisé et consommation : `null` tant que rien n'est saisi. */
export type Realise = Record<CleProduit, number | null>;
export type Consommation = Record<Matiere, number | null>;

export type Justification = { motif: MotifEcart; texte: string };

/** Demande d'augmentation de production en attente de l'accord du gérant (R15). */
export type DemandeProduction = {
  id: string;
  /** Numéro affiché « DEM-021 ». */
  numero: number;
  supplement: Quantites;
  total: number;
  motif: MotifSupplement;
};

export type StatutProduction = 'cloturee' | 'non-cloturee';

/** Une ligne de l'historique des productions rattachées aux semaines. */
export type LigneHistorique = {
  id: string;
  /** « AAAA-MM-JJ ». */
  date: string;
  type: Creneau;
  responsable: string;
  validePar: string;
  ouvertA: string;
  clotureA: string;
  sacs: number;
  prevus: number;
  /** `null` : rien n'a été réalisé (production non clôturée). */
  realise: number | null;
  /** Écart de matières pesées en kg, signé. */
  ecartKg: number;
  statut: StatutProduction;
  /** Motif de la justification de l'écart, quand elle a été envoyée. */
  motif?: MotifEcart;
  /** Note libre (données de départ). */
  note?: string;
};

/** Tout ce que l'écran affiche, tel que le serveur le renvoie. */
export type InstantaneProduction = {
  session: { type: Creneau; date: string };
  semaine: { numero: number; du: string; au: string };
  gerant: string;
  responsable: string;
  caissiere: string;
  etape: Etape;
  planPropose: Jalon | null;
  planValide: Jalon | null;
  ouverte: Jalon | null;
  cloturee: Jalon | null;
  /** Clients qui ont passé commande. */
  clientsCommandes: number;
  plan: Plan;
  demande: DemandeEstimee;
  realise: Realise;
  consommation: Consommation;
  justification: Justification | null;
  /** Écart de matière toléré par sac travaillé, en kg (R10). */
  seuilEcartKg: number;
  /** Stock actuel de chaque matière, dans l'unité du stock (farine en sacs). */
  stock: Record<Matiere, number>;
  demandeEnAttente: DemandeProduction | null;
  /** Plus anciennes d'abord. */
  historique: LigneHistorique[];
};

export type SortieDeStock = { matiere: Matiere; quantite: number };

export type ReponseCloture = { instantane: InstantaneProduction; sorties: SortieDeStock[] };

/** Ce que la direction voit d'un produit : les ingrédients d'un sac de 50 kg. */
export const INGREDIENTS = ['farine', 'eau', 'sel', 'levure', 'ameliorant', 'glace'] as const;
export type Ingredient = (typeof INGREDIENTS)[number];

export type Recette = {
  /** Poids d'une boule de pâte, en grammes. */
  boule: number;
  /** Pains par boule. */
  pb: number;
} & Record<Ingredient, number>;

export type FicheProduit = {
  /** Identifiant d'adresse : `?fiche=gc135`. */
  id: string;
  /** Code affiché sur la pastille : « GC 135 ». */
  code: string;
  nom: string;
  nomEn: string;
  recette: Recette;
  version: number;
  /** Date de la dernière modification, « AAAA-MM-JJ ». */
  modifieLe: string;
  /** Heure de la dernière modification ; vide pour la version de départ. */
  modifieA: string;
  modifiePar: string;
  /** Prix de vente relevés : revendeur et détail ; absent : aucun prix relevé. */
  prix: [revendeur: number, detail: number] | null;
  /** Pains produits en octobre. */
  produitsOctobre: number;
  /** Minutes de cuisson au four à bois. */
  cuisson: number;
};

export type InstantaneFiches = {
  fiches: FicheProduit[];
  /** Prix unitaire de chaque matière, relevé des derniers achats en stock (FCFA). */
  prix: Record<Matiere, number>;
};

export type ModificationFiche = Recette;

/** Valeurs en cours de saisie : le texte tapé, vide tant que rien n'est saisi. */
export type Brouillon<K extends string> = Record<K, string>;
