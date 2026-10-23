import type { Profil } from '../../../profils.ts';

/** Les cinq demandes de validation du cahier des charges (§5.9). */
export type TypeDemande = 'plafond' | 'depense' | 'paie' | 'inventaire' | 'production';

export type StatutDemande = 'en-attente' | 'acceptee' | 'refusee';

/** L'objet auquel la demande reste rattachée : l'écran propose d'y aller. */
export type ObjetLie =
  | { genre: 'client'; id: string; nom: string; solde: number }
  | { genre: 'depense'; code: string; montant: number; semaine: number }
  /** Mois de la paie, « AAAA-MM ». */
  | { genre: 'paie'; mois: string }
  | { genre: 'inventaire'; code: string }
  | { genre: 'production' };

type DemandeEmise = {
  id: string;
  /** Numéro affiché « DEM-021 ». */
  numero: number;
  type: TypeDemande;
  titre: string;
  /** Absent : le titre français s'affiche dans les deux langues. */
  titreEn?: string;
  detail: string;
  /** Absent : le détail français s'affiche dans les deux langues. */
  detailEn?: string;
  par: string;
  parProfil: Profil;
  /** Jour d'émission, « AAAA-MM-JJ ». */
  jour: string;
  /** Heure d'émission, « HH:MM ». */
  heure: string;
  objet: ObjetLie | null;
};

/** Une demande décidée porte toujours qui a décidé et quand : jamais de « par undefined ». */
export type Demande = DemandeEmise &
  (
    | { statut: 'en-attente'; decidePar?: undefined; decideA?: undefined }
    | {
        statut: 'acceptee' | 'refusee';
        decidePar: string;
        /** Heure de la décision, « HH:MM ». */
        decideA: string;
      }
  );

export type ReponseDemandes = {
  /** Gérant de la semaine, cité dans « À valider par ». */
  gerant: string;
  proprietaire: string;
  /** Plus récentes d'abord. */
  demandes: Demande[];
};

export type ReponseDecision = { demande: Demande };
