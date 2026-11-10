/*
 * Paramètres métier (US-023, cahier des charges §9). Le contrat est celui de l'API
 * (`/api/v1/parametres/`, schéma `Parametre`) : le catalogue vient du serveur, l'écran ne le
 * connaît pas en dur.
 */

export const GENRES = [
  'montant',
  'entier',
  'pourcentage',
  'heure',
  'jour',
  'jours',
  'choix',
] as const;

export type Genre = (typeof GENRES)[number];

export const JOURS_DE_LA_SEMAINE = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

export type JourDeLaSemaine = (typeof JOURS_DE_LA_SEMAINE)[number];

/** Une valeur : entier (montant, entier, pourcentage, choix), « HH:MM », jour ou liste de jours. */
export type ValeurParametre = number | string | string[];

export type Parametre = {
  cle: string;
  libelle: string;
  genre: Genre;
  /** « FCFA », « kg », « % », « minutes »… ; vide quand la valeur n'a pas d'unité. */
  unite: string;
  /** Règle ou écran qui s'appuie sur le paramètre (« R6, livraisons »). */
  usage: string;
  valeur: ValeurParametre;
  defaut: ValeurParametre;
  /** Valeurs permises, pour le genre `choix`. */
  choix: number[];
  minimum: number | null;
  maximum: number | null;
  /** Dernière modification, ISO 8601 ; absente tant que la valeur par défaut est en vigueur. */
  modifie_le: string | null;
  modifie_par: string;
};

/** Une valeur passée, de la plus récente à la plus ancienne. */
export type ValeurPassee = {
  valeur: ValeurParametre;
  auteur: string;
  le: string;
};

/** Une ligne du tableau « Produits et fiches techniques » (résumé de la fiche, sans la recette). */
export type ProduitParametre = {
  /** Identifiant d'adresse de la fiche : `?fiche=gc135`. */
  id: string;
  /** Code affiché : « GC 135 ». */
  code: string;
  nom: string;
  nomEn: string;
  /** Poids d'une boule de pâte, en grammes. */
  boule: number;
  /** Pains par boule. */
  pb: number;
  /** Pains par sac de 50 kg de farine. */
  painsParSac: number;
  /** Prix observés : revendeur et détail ; absent : aucun prix relevé. */
  prix: [revendeur: number, detail: number] | null;
};

/** Motif d'un refus de valeur ; l'écran le traduit, le serveur en fait une phrase. */
export type ErreurValeur =
  | { code: 'entier' }
  | { code: 'bornes'; minimum: number; maximum: number | null }
  | { code: 'choix'; permis: readonly number[] }
  | { code: 'heure' }
  | { code: 'jour' }
  | { code: 'jours' };
