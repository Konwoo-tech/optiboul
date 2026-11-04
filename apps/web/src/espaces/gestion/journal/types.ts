import type { Profil } from '../../../profils.ts';

/**
 * Familles d'actions du journal, pour le filtre « type ». Un type par domaine métier ; les
 * décisions (accord, refus, demande d'autorisation) forment le type `demande`.
 */
export const TYPES_ACTION = [
  'connexion',
  'session',
  'caisse',
  'depense',
  'demande',
  'stock',
  'fournisseur',
  'production',
  'semaine',
  'paie',
  'utilisateur',
  'parametre',
] as const;

export type TypeAction = (typeof TYPES_ACTION)[number];

/** Une action consignée : qui, quand, quoi, et les valeurs avant / après quand elle modifie une donnée. */
export type EntreeJournal = {
  id: string;
  /** Instant de l'action, ISO 8601 UTC. */
  quand: string;
  /** Jour de l'action à l'heure de la boulangerie, « AAAA-MM-JJ ». */
  jour: string;
  /** Heure de l'action à l'heure de la boulangerie, « HH:MM ». */
  heure: string;
  auteur: string;
  /** Profil de l'auteur ; absent pour le système. */
  profil: Profil | null;
  type: TypeAction;
  texte: string;
  avant?: string;
  apres?: string;
};

/** Filtres du journal (critères d'acceptation d'US-024) ; un filtre vide ne filtre pas. */
export type FiltresJournal = {
  auteur: string;
  type: TypeAction | '';
  /** Premier jour, « AAAA-MM-JJ » ; vide : sans borne. */
  du: string;
  au: string;
};

export const SANS_FILTRE: FiltresJournal = { auteur: '', type: '', du: '', au: '' };

export type InstantaneJournal = {
  /** Au plus `LIMITE_AFFICHEE` entrées, les plus récentes d'abord. */
  entrees: EntreeJournal[];
  /** Nombre d'entrées qui répondent aux filtres, au-delà de la limite comprises. */
  total: number;
  /** Auteurs présents dans le journal, pour le filtre. */
  auteurs: string[];
  /** Jour de l'horloge, « AAAA-MM-JJ » : une entrée du jour n'affiche que son heure. */
  aujourdhui: string;
};

/** Comme la maquette : les 40 dernières actions. */
export const LIMITE_AFFICHEE = 40;
