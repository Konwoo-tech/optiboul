import type { Matiere } from '../../comptoir/depenses/types.ts';

export { MATIERES, type Matiere } from '../../comptoir/depenses/types.ts';

/** Conditions de paiement d'un fournisseur (fiche, cahier des charges §5.7). */
export const CONDITIONS = ['credit-lundi-mardi', 'sept-jours', 'a-la-livraison'] as const;
export type Conditions = (typeof CONDITIONS)[number];

export type Fournisseur = {
  id: string;
  nom: string;
  matieres: readonly Matiere[];
  /** Sans l'indicatif : « 6 99 10 20 30 ». */
  telephone: string;
  conditions: Conditions;
  /** Livre à crédit : la facture a une échéance après la livraison. */
  credit: boolean;
};

export type StatutCommande = 'planifiee' | 'recue' | 'partielle';

/** Bon de commande, planifié puis réceptionné (« BC-032 »). */
export type Commande = {
  /** « BC-032 ». */
  numero: string;
  fournisseur: string;
  matiere: Matiere;
  /** Quantité commandée, dans l'unité de la matière. */
  commandee: number;
  recue: number;
  /** Jour prévu, « AAAA-MM-JJ ». */
  jour: string;
  statut: StatutCommande;
  planifieePar: string;
  recuePar: string;
  /** Réception : jour « AAAA-MM-JJ » et heure « HH:MM » ; `null` tant qu'elle n'a pas eu lieu. */
  recueLe: { jour: string; heure: string } | null;
  semaine: string;
  /** Numéro du bon qui porte le reliquat, une fois replanifié. */
  reliquat?: string;
};

export const STATUTS_FACTURE = ['a-payer', 'en-cours', 'payee'] as const;
export type StatutFacture = (typeof STATUTS_FACTURE)[number];

/** Ce que dit la facture : le texte est construit à l'affichage, dans la langue de la personne. */
export type ObjetFacture =
  /** Farine cumulée sur la semaine : « Farine · semaine 42 (44 sacs à ce jour) ». */
  | { genre: 'farine'; semaine: number; sacs: number }
  /** Facture d'une réception : « BC-032 · Levure, 6 kg reçus sur 10 ». */
  | { genre: 'reception'; commande: string; matiere: Matiere; recue: number; commandee?: number }
  /** Livraison déjà facturée : « Bois · 2 chargements (BC-027) ». */
  | { genre: 'livraison'; commande: string; matiere: Matiere; quantite: number };

/** Modes de paiement d'une facture fournisseur (cahier des charges §5.7). */
export const MODES_PAIEMENT = ['especes', 'banque', 'mobile'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export type Facture = {
  /** « FAC-41 », « FAC-0213 ». */
  numero: string;
  fournisseur: string;
  objet: ObjetFacture;
  /** Entiers FCFA. */
  montant: number;
  /** Échéance, « AAAA-MM-JJ ». */
  echeance: string;
  /** Une facture de farine reste « en cours » jusqu'à la clôture de sa semaine. */
  statut: StatutFacture;
  /** Échéance dépassée et pas payée. */
  enRetard: boolean;
  semaine: string;
  /** Paiement : jour « AAAA-MM-JJ », mode et numéro de la dépense créée. */
  payeeLe?: string;
  mode?: ModePaiement;
  depense?: string;
};

export type InstantaneFournisseurs = {
  /** Aujourd'hui, « AAAA-MM-JJ » : référence des retards. */
  aujourdhui: string;
  /** Jours où une réception peut être planifiée (aujourd'hui et les sept suivants). */
  jours: string[];
  fournisseurs: Fournisseur[];
  commandes: Commande[];
  factures: Facture[];
};

export type NouvelleCommande = {
  fournisseur: string;
  matiere: Matiere;
  quantite: number;
  jour: string;
};

export type NouvelleReception = {
  commande: string;
  quantite: number;
  observation?: string;
};

export type NouveauPaiement = { facture: string; mode: ModePaiement };
