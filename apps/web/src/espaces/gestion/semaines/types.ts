import type { Creneau } from '@/utils';

import type { Profil } from '../../../profils.ts';
import type { MotifEcart } from '../../atelier/production/types.ts';
import type { Matiere } from '../../comptoir/depenses/types.ts';

export type { Creneau } from '@/utils';

/** Cycle de vie d'une semaine (cahier des charges §5.1) : planifiée, ouverte, clôturée. */
export const STATUTS_SEMAINE = ['planifiee', 'ouverte', 'cloturee'] as const;
export type StatutSemaine = (typeof STATUTS_SEMAINE)[number];

export type Personne = { id: string; nom: string; profil: Profil };

/** Qui a fait quoi, quel jour (« AAAA-MM-JJ ») et à quelle heure (« HH:MM »). */
export type Passage = { par: string; jour: string; heure: string };

export type Semaine = {
  /** Identifiant partagé avec les dépenses : « S42 ». */
  id: string;
  /** Identifiant de la semaine sur le serveur. */
  idServeur?: number;
  numero: number;
  /** Lundi et dimanche de la semaine, « AAAA-MM-JJ ». */
  du: string;
  au: string;
  statut: StatutSemaine;
  gerant: Personne | null;
  production: Personne | null;
  /** Nom de la personne qui a planifié la semaine ; vide : pas encore planifiée par quelqu'un. */
  planifieePar: string;
  ouverture: Passage | null;
  cloture: Passage | null;
};

/** Caissière de chaque créneau d'un jour, par identifiant ; vide : à affecter. */
export type AffectationJour = Record<Creneau, string>;
/** Semaine → jour (« AAAA-MM-JJ ») → affectations. */
export type Planning = Record<string, Record<string, AffectationJour>>;

/** Ce qui s'est réellement passé sur un créneau : une caisse fermée ou en cours. */
export type CreneauReel = {
  jour: string;
  type: Creneau;
  caissiere: Personne;
  /** « HH:MM ». */
  ouverture: string;
  fermeture: string | null;
  /** Écart de caisse en FCFA (compté − attendu) ; absent tant que la caisse est ouverte. */
  ecart: number | null;
  enCours: boolean;
};

export type Indicateurs = {
  /** Recette encaissée de la semaine, entiers FCFA. */
  recette: number;
  depenses: { nombre: number; montant: number };
  productions: { nombre: number; sacs: number };
  /** Somme des écarts des caisses fermées. */
  ecartCumule: number;
  /** Ouvertures et fermetures de caisse rattachées à la semaine. */
  caisses: number;
  receptions: number;
};

export type NiveauControle = 'ok' | 'surveiller' | 'bloquant';

/** Contrôles avant clôture : les deux premiers bloquent, les trois autres sont « à voir ». */
export type Controle =
  | {
      cle: 'caisse';
      niveau: 'ok' | 'bloquant';
      /** La caisse ouverte, quand elle bloque. */
      session?: { type: Creneau; jour: string; par: string; heure: string };
    }
  | { cle: 'production'; niveau: 'ok' | 'bloquant'; responsable: string }
  | { cle: 'dettes'; niveau: 'ok' | 'surveiller'; clients: number; montant: number }
  | {
      cle: 'factures';
      niveau: 'ok' | 'surveiller';
      factures: { numero: string; libelle: string }[];
    }
  | { cle: 'demandes'; niveau: 'ok' | 'surveiller'; numeros: number[] };

export type Incident =
  | { genre: 'ecart-matiere'; par: string; motif: MotifEcart }
  | { genre: 'production'; jour: string; creneau: Creneau; note: string }
  | { genre: 'demande'; numero: number; titre: string; titreEn?: string }
  | { genre: 'reouverture'; par: string; heure: string };

/** Rapport de passation, envoyé au gérant de la semaine suivante (cahier des charges §5.1). */
export type Passation = {
  numeroSuivante: number | null;
  destinataire: Personne | null;
  caisses: { derniere: { jour: string; par: string; compte: number } | null; ecartCumule: number };
  /** Entiers FCFA : la dette des clients est négative, comme leur solde. */
  dettes: { clients: number; fournisseurs: number };
  stockBas: Matiere[];
  incidents: Incident[];
};

export type Cloture = { controles: Controle[]; passation: Passation };

/** Tout ce que l'écran affiche, tel que le serveur le renvoie. */
export type InstantaneSemaines = {
  moi: Personne;
  semaines: Semaine[];
  gerants: Personne[];
  responsables: Personne[];
  caissieres: Personne[];
  planning: Planning;
  creneaux: CreneauReel[];
  indicateurs: Record<string, Indicateurs>;
  /** Seulement pour la semaine ouverte. */
  clotures: Record<string, Cloture>;
};

export type RoleAffecte = 'gerant' | 'production';

export type NouvelleAffectation = { semaine: string; role: RoleAffecte; personne: string };
export type NouveauCreneau = {
  semaine: string;
  jour: string;
  creneau: Creneau;
  caissiere: string;
};
