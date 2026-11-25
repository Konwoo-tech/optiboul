/** Cycle de l'état de paie (cahier des charges §5.10) : brouillon, soumis, validé, paiement, payée. */
export const STATUTS_PAIE = ['brouillon', 'soumis', 'valide', 'en-paiement', 'payee'] as const;
export type StatutPaie = (typeof STATUTS_PAIE)[number];

/** Espèces (sortie de caisse), mobile money ou banque. */
export const MODES_PAIEMENT = ['especes', 'mobile', 'banque'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export type TypeAjustement = 'gain' | 'penalite';

/** Gain ou pénalité motivé d'un employé pour le mois. */
export type Ajustement = {
  id: string;
  type: TypeAjustement;
  libelle: string;
  /** Entiers FCFA, toujours positifs : le type dit le sens. */
  montant: number;
  /** Jour de la saisie, « AAAA-MM-JJ ». */
  date: string;
  par: string;
};

export type Paiement = {
  montant: number;
  mode: ModePaiement;
  /** Référence de la transaction, obligatoire en mobile money (R7). */
  reference?: string;
  /** « AAAA-MM-JJ ». */
  date: string;
  par: string;
};

export type Employe = {
  id: string;
  /** Identifiant de l'employé sur le serveur (la fiche et la ligne de paie sont distinctes). */
  employeId?: number;
  nom: string;
  poste: string;
  /** Salaire de base mensuel, FCFA. */
  base: number;
  /** Jours d'absence du mois. */
  absences: number;
  /** Avances sur salaire à retenir, FCFA. */
  avances: number;
  /** Impayé du mois précédent, repris sur cette paie (R12). */
  impaye: number;
  ajustements: Ajustement[];
  paiements: Paiement[];
};

export type MoisDuCalendrier = {
  /** « AAAA-MM ». */
  mois: string;
  /** Jour de paie, « AAAA-MM-JJ ». */
  jour: string;
  statut: 'payee' | 'partielle' | 'courante' | 'planifiee';
  /** Total payé et impayés reportés d'un mois passé. */
  total?: number;
  impayes?: number;
  /** Jours que le gérant peut choisir ; absent : le jour est figé. */
  jours?: string[];
};

/** La demande de validation de l'état de paie, tant qu'elle attend le propriétaire. */
export type DemandeDePaie = { id: string; numero: number };

export type InstantanePaie = {
  /** « AAAA-MM » du mois en cours de paie. */
  mois: string;
  statut: StatutPaie;
  jourDePaie: string;
  /** Jours proposés tant que l'état est en brouillon. */
  joursPossibles: string[];
  soumisPar: string;
  validePar: string;
  /** Heure de la validation, « HH:MM ». */
  valideA: string;
  demande: DemandeDePaie | null;
  employes: Employe[];
  calendrier: MoisDuCalendrier[];
  /** Jour du serveur, « AAAA-MM-JJ » : le décompte avant la paie en part. */
  aujourdhui: string;
  /** Vrai serveur : identifiant de l'état de paie affiché. */
  etat?: number;
  /** Vrai serveur : le mois n'a pas encore d'état ; « AAAA-MM » à préparer. */
  aPreparer?: string | null;
};

export type NouvelAjustement = {
  employe: string;
  type: TypeAjustement;
  libelle: string;
  montant: number;
};
export type NouveauPaiement = {
  employe: string;
  mode: ModePaiement;
  montant?: number;
  reference?: string;
};
export type PaiementDesRestes = { mode: ModePaiement; reference?: string };
export type ReponsePaiement = { instantane: InstantanePaie; depenses: string[] };
