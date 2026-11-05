/** Où se trouve la copie : sur le poste de la boulangerie ou dans le cloud chiffré. */
export const GENRES_COPIE = ['locale', 'cloud'] as const;
export type GenreCopie = (typeof GENRES_COPIE)[number];

/**
 * Ce qui a déclenché la copie : le planning (toutes les 4 h), la clôture d'une session, le bouton
 * « Sauvegarder maintenant » / « Lancer la sauvegarde cloud », ou la copie de sûreté faite
 * automatiquement avant une restauration.
 */
export const DECLENCHEURS = ['planifiee', 'cloture', 'manuelle', 'avant_restauration'] as const;
export type Declencheur = (typeof DECLENCHEURS)[number];

/** Une copie disponible (maquette « OptiBoul ERP v2 » : liste « Copies disponibles »). */
export type Copie = {
  id: string;
  genre: GenreCopie;
  declencheur: Declencheur;
  /** Instant de la copie, ISO 8601 UTC. */
  instant: string;
};

/** État de « Gestion › Sauvegardes » : les cartes « Copie locale » / « Copie cloud » et la liste. */
export type InstantaneSauvegardes = {
  /** Copies disponibles, la plus récemment faite d'abord. */
  copies: Copie[];
  /** Instant de la dernière copie locale faite, ou `null` s'il n'y en a aucune. */
  derniereLocale: string | null;
  /** Instant de la dernière copie cloud faite, ou `null` s'il n'y en a aucune. */
  derniereCloud: string | null;
  /** Aucune copie cloud depuis plus de `seuilAlerteHeures` (alerte « En retard »). */
  cloudEnRetard: boolean;
  seuilAlerteHeures: number;
};

/** Ce qui est contrôlé après une restauration (maquette : « sessions, soldes clients, stocks »). */
export const CONTROLES_RESTAURATION = ['sessions', 'soldes_clients', 'stocks'] as const;
export type ControleRestauration = (typeof CONTROLES_RESTAURATION)[number];

/** Compte rendu d'une restauration guidée. */
export type Restauration = {
  /** La copie restaurée. */
  copie: Copie;
  /** La copie de l'état d'avant, faite automatiquement (étape 1 de la maquette). */
  copieAvant: Copie;
  controles: { cle: ControleRestauration; ok: boolean }[];
};

/** Réponse d'une action : le nouvel état, et la copie ou la restauration produite. */
export type ReponseCopie = { copie: Copie; instantane: InstantaneSauvegardes };
export type ReponseRestauration = { restauration: Restauration; instantane: InstantaneSauvegardes };
