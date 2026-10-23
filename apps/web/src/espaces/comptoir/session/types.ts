import type { Creneau } from '@/utils';

/** Produits saisis au comptoir (maquette : BAG, KO, GC 135). */
export const CLES_PRODUIT = ['BAG', 'KO', 'GC'] as const;
export type CleProduit = (typeof CLES_PRODUIT)[number];

export const MODES_PAIEMENT = ['especes', 'mtn', 'orange'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export const TYPES_MOUVEMENT = ['vente-guichet', 'retours', 'reste-en-salle', 'ration'] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

export type Quantites = Record<CleProduit, number>;
/** Valeur d'un champ de saisie : des chiffres, éventuellement rien. */
export type Saisies = Record<CleProduit, string>;

export type Client = {
  id: string;
  nom: string;
  type: string;
  lieu: string;
  telephone: string;
  /** Tarif du client, en entiers FCFA l'unité. */
  prix: Quantites;
  /** Solde en entiers FCFA : négatif = dette. */
  solde: number;
};

export type Livraison = {
  id: string;
  /** Numéro du bon de livraison. */
  numero: number;
  clientId: string;
  nom: string;
  quantites: Quantites;
  prix: Quantites;
  du: number;
  recu: number;
  mode: ModePaiement;
  reference: string;
  /** Reçu − dû : négatif = nouvelle dette, positif = remboursement d'une ancienne. */
  reste: number;
  soldeAvant: number;
  soldeApres: number;
  /** « HH:MM ». */
  heure: string;
  par: string;
  /** Qui a autorisé le dépassement du plafond, le cas échéant. */
  autorisePar: string;
};

export type Mouvement = {
  id: string;
  type: TypeMouvement;
  produit: CleProduit;
  quantite: number;
  motif: string;
  par: string;
  heure: string;
};

/** `soldeApres` : le solde le plus bas que cette autorisation couvre. Au-delà, elle ne vaut plus. */
export type Autorisation = { par: string; heure: string; soldeApres: number };

export type DemandePlafond = {
  id: string;
  clientId: string;
  clientNom: string;
  soldeApres: number;
  plafond: number;
  par: string;
  heure: string;
  statut: 'en-attente' | 'acceptee' | 'refusee';
  /** Qui a tranché, et à quelle heure (« HH:MM »), une fois la décision prise. */
  decidePar?: string;
  decideA?: string;
};

export type SessionCaisse = {
  type: Creneau;
  /** Jour de la session, ISO « 2026-10-14 ». */
  date: string;
  statut: 'ouverte' | 'cloturee';
  ouverteA: string;
  ouvertePar: string;
  clotureeA: string;
  cloturePar: string;
  /** Espèces comptées à la clôture : des chiffres, ou rien tant qu'on n'a pas compté. */
  especesComptees: string;
  fonds: number;
  rouvertePar: string;
  rouverteA: string;
};

/** Tout ce que l'écran affiche, renvoyé en bloc par le serveur après chaque action. */
export type InstantaneSession = {
  session: SessionCaisse;
  /** Plafond de dette d'un client, en FCFA. */
  plafond: number;
  clients: Client[];
  commandes: Record<string, Saisies>;
  /** Commande habituelle de chaque client à cette session. */
  habituelles: Record<string, Quantites>;
  /** Heure de la dernière relance WhatsApp, par client. */
  relances: Record<string, string>;
  /** Plus récente en premier. */
  livraisons: Livraison[];
  mouvements: Mouvement[];
  autorisations: Record<string, Autorisation>;
  demandes: DemandePlafond[];
  /** Dépenses payées en espèces pendant la session. */
  depensesCaisse: number;
  /** Livraison dont le bon s'ouvre avec F8. */
  dernierBon: string | null;
  numeroProchainBon: number;
  /** Jour avant lequel les dettes doivent être réglées (bon de livraison), ISO. */
  echeanceDettes: string;
};
