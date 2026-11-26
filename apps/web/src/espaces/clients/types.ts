/** Catégorie d'un client ; l'interface la traduit. */
export type TypeClient = 'livreur' | 'restaurant' | 'hotel' | 'particulier';

/** Prix appliqués au client, par code de produit du serveur (BAG, KO, GC135…). */
export type TarifsClient = Record<string, number>;

/** Un client tel que l'écran « Clients et dettes » l'affiche. */
export type ClientDeLecran = {
  id: string;
  nom: string;
  type: TypeClient;
  lieu: string;
  telephone: string;
  /** Prix unitaire de chaque pain pour ce client, en FCFA. */
  tarifs: TarifsClient;
  /** Solde en FCFA entier : négatif = le client doit de l'argent. */
  solde: number;
  /** Une relance WhatsApp a déjà été envoyée à ce client. */
  relance: boolean;
  /** Plafond propre à ce client ; absent : celui de la liste. */
  plafond?: number;
  /** Plafond fixé pour ce client seul ; `null` : celui de la liste. */
  plafondPropre?: number | null;
  /** Prix propres du client (code du produit → FCFA), sans les prix de base. */
  tarifsPropres?: Record<string, number>;
  actif?: boolean;
};

export type ListeClients = {
  /** Plafond de dette par client, en FCFA. */
  plafond: number;
  /** Date limite de règlement (le dimanche de la semaine), `AAAA-MM-JJ`. */
  echeance: string;
  clients: ClientDeLecran[];
};

/** Une ligne de l'historique d'un client : livraison, avec ce qui était dû et ce qui a été payé. */
export type LigneHistoriqueClient = {
  /** Numéro du bon de livraison. */
  bon: number;
  /** Jour de la session, `AAAA-MM-JJ`. */
  date: string;
  /** Heure de la livraison (`21:41`) ou `nuit` pour une session passée (traduit par l'interface). */
  moment: string;
  du: number;
  recu: number;
};
