/** Créneau d'une caisse : la boulangerie travaille de jour (équipe de jour) et de nuit. */
export type TypeSession = 'jour' | 'nuit';

export type Personne = { id: string; nom: string };

/** Ouverture ou fermeture : heure « HH:MM » et nom de la personne qui l'a faite. */
export type Passage = { heure: string; par: string };

/** Une ouverture de caisse (une ligne du tableau). Tous les montants sont des entiers FCFA. */
export type SessionCaisse = {
  id: string;
  /** Jour de l'ouverture, « AAAA-MM-JJ ». */
  jour: string;
  type: TypeSession;
  caissiere: Personne;
  ouverture: Passage;
  /** Absente tant que la caisse est ouverte. */
  fermeture: Passage | null;
  fonds: number;
  /** Espèces attendues : fonds + espèces encaissées − dépenses − remises au coffre. */
  attendu: number;
  /** Espèces comptées à la fermeture (un seul comptage). */
  compte: number | null;
  /** Recette encaissée, tous modes de paiement. */
  recette: number;
  enCours: boolean;
};

/** Détail des espèces de la caisse ouverte, pour la fermeture et la remise au coffre. */
export type DetailEspeces = {
  fonds: number;
  especes: number;
  depenses: number;
  remises: number;
  attendu: number;
};

/** Créneau que l'on peut ouvrir ensuite, et la caissière que le planning y a mise. */
export type ProchaineOuverture = {
  type: TypeSession;
  jour: string;
  planifiee: Personne | null;
};

/** La caisse ouverte, connue de tous les profils de l'écran (qui l'a ouverte, quand). */
export type CaisseOuverte = {
  /** Identifiant de la caisse sur le vrai serveur (la simulation n'en a pas besoin). */
  id?: string;
  jour: string;
  type: TypeSession;
  caissiere: Personne;
  ouverture: Passage;
};

export type ReponseCaisses = {
  /** Identifiant de la personne connectée. */
  moi: string;
  caissieres: Personne[];
  /** Fermées d'abord (ordre d'enregistrement), puis la caisse ouverte s'il y en a une. */
  sessions: SessionCaisse[];
  caisseOuverte: CaisseOuverte | null;
  /** Détail de la caisse ouverte, seulement pour la personne qui peut la voir. */
  detail: DetailEspeces | null;
  prochaine: ProchaineOuverture;
  /** La dernière caisse est fermée et peut être rouverte (gérant, propriétaire). */
  rouvrable: boolean;
  /** Plafond d'espèces en caisse au-delà duquel on propose une remise au coffre. */
  plafond: number;
  /**
   * Chiffres par caissière (ouvertures, recette, écart cumulé), quand le serveur les donne : la
   * recette d'une caisse seule n'existe pas, seulement le total par caissière.
   */
  recapitulatif?: Record<string, { ouvertures: number; recette: number; ecart: number }>;
  /** Personnes qui peuvent recevoir une remise au coffre (gérants et propriétaire). */
  receveurs: Personne[];
};

export type OuvertureDemandee = { fonds: number };
export type FermetureDemandee = { compte: number };
export type ReouvertureDemandee = { motif: string };
export type RemiseDemandee = { montant: number; receveur: string };

/** Résultat d'une remise : ce qui reste attendu en caisse et la trace. */
export type RemiseEnregistree = { attendu: number; receveur: string; heure: string };
