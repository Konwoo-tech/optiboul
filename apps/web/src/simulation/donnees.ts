import type { Profil } from '../profils.ts';

/** Compte tel que le serveur le connaît. Le téléphone ne quitte jamais le serveur en clair. */
export type CompteSimule = {
  id: string;
  nom: string;
  profil: Profil;
  email: string;
  telephone: string;
  /** Groupe d'utilisateurs : il porte le profil de droits (cahier des charges §3.2). */
  groupe: string;
  /** Dernier accès, « AAAA-MM-JJTHH:MM » (heure de Yaoundé). */
  dernierAcces: string;
};

/** Ce que l'écran de connexion a le droit de voir d'un compte. */
export type UtilisateurSimule = Omit<CompteSimule, 'telephone' | 'groupe' | 'dernierAcces'>;

/** Groupe d'utilisateurs de la maquette : un nom, un profil de droits, une description. */
export type GroupeSimule = {
  id: string;
  nom: string;
  /** Nom anglais ; absent pour un groupe créé à l'écran. */
  nomEn?: string;
  profil: Profil;
  description: string;
  descriptionEn?: string;
};

/** Code à 4 chiffres de tous les comptes de démonstration (connexion « nom + code »). */
export const CODE_DEMO = '1234';
/** Mot de passe de tous les comptes de démonstration (connexion e-mail). */
export const MOT_DE_PASSE_DEMO = 'optiboul';
/** Code reçu par SMS ou WhatsApp (double authentification). */
export const CODE_OTP_DEMO = '123456';

/**
 * Équipe de démonstration (maquette « OptiBoul ERP v2 »), dans l'ordre de l'écran de connexion.
 * Données littérales, sans appel de fonction : le paquet de production n'en embarque aucune.
 */
export const COMPTES_SIMULES: readonly CompteSimule[] = [
  {
    id: 'davy',
    nom: 'Davy',
    profil: 'caissier',
    email: 'davy.boulfaubourg@gmail.com',
    telephone: '6 77 41 20 18',
    groupe: 'g1',
    dernierAcces: '2026-10-14T18:02',
  },
  {
    id: 'rachel',
    nom: 'Rachel',
    profil: 'caissier',
    email: 'rachel.boulfaubourg@gmail.com',
    telephone: '6 99 52 87 03',
    groupe: 'g2',
    dernierAcces: '2026-10-14T06:01',
  },
  {
    id: 'willy',
    nom: 'Willy',
    profil: 'gerant',
    email: 'willy.boulfaubourg@gmail.com',
    telephone: '6 55 18 64 90',
    groupe: 'g3',
    dernierAcces: '2026-10-14T17:40',
  },
  {
    id: 'serge',
    nom: 'Serge',
    profil: 'production',
    email: 'serge.boulfaubourg@gmail.com',
    telephone: '6 70 33 25 71',
    groupe: 'g4',
    dernierAcces: '2026-10-14T17:55',
  },
  {
    id: 'fotso',
    nom: 'M. Fotso',
    profil: 'proprietaire',
    email: 'fotso.boulfaubourg@gmail.com',
    telephone: '6 94 60 11 45',
    groupe: 'g5',
    dernierAcces: '2026-10-13T22:10',
  },
  {
    id: 'admin',
    nom: 'Support OptiBoul',
    profil: 'administrateur',
    email: 'support.optiboul@gmail.com',
    telephone: '6 58 72 09 36',
    groupe: 'g6',
    dernierAcces: '2026-10-10T09:30',
  },
  {
    id: 'patrick',
    nom: 'Patrick',
    profil: 'gerant',
    email: 'patrick.boulfaubourg@gmail.com',
    telephone: '6 77 90 14 52',
    groupe: 'g3',
    dernierAcces: '2026-10-11T21:40',
  },
  {
    id: 'christelle',
    nom: 'Christelle',
    profil: 'gerant',
    email: 'christelle.boulfaubourg@gmail.com',
    telephone: '6 99 31 68 27',
    groupe: 'g3',
    dernierAcces: '2026-10-04T18:10',
  },
  {
    id: 'ignace',
    nom: 'Ignace',
    profil: 'production',
    email: 'ignace.boulfaubourg@gmail.com',
    telephone: '6 55 84 03 19',
    groupe: 'g4',
    dernierAcces: '2026-10-13T19:02',
  },
];

/** Groupes de départ (cahier des charges §3.2), dans l'ordre de la maquette. */
export const GROUPES_SIMULES: readonly GroupeSimule[] = [
  {
    id: 'g1',
    nom: 'Caisse – équipe de nuit',
    nomEn: 'Cash desk – night team',
    profil: 'caissier',
    description: 'Livraisons, encaissements et clôture des sessions de nuit.',
    descriptionEn: 'Deliveries, payments and closing of night sessions.',
  },
  {
    id: 'g2',
    nom: 'Caisse – équipe de jour',
    nomEn: 'Cash desk – day team',
    profil: 'caissier',
    description: 'Mêmes droits, pour les sessions de jour.',
    descriptionEn: 'Same rights, for day sessions.',
  },
  {
    id: 'g3',
    nom: 'Gérants de la semaine',
    nomEn: 'Managers of the week',
    profil: 'gerant',
    description: 'Gérant en rotation : autorisations, achats, paie, clôture de semaine.',
    descriptionEn: 'Rotating manager: authorisations, purchasing, payroll, week close.',
  },
  {
    id: 'g4',
    nom: 'Production',
    nomEn: 'Production',
    profil: 'production',
    description: 'Plan de production, production réalisée et consommation des matières.',
    descriptionEn: 'Production plan, actual output and material use.',
  },
  {
    id: 'g5',
    nom: 'Direction',
    nomEn: 'Management',
    profil: 'proprietaire',
    description: 'Vue complète, validation des dépenses et de la paie.',
    descriptionEn: 'Full view, approval of expenses and payroll.',
  },
  {
    id: 'g6',
    nom: 'Support informatique',
    nomEn: 'IT support',
    profil: 'administrateur',
    description: 'Comptes, groupes, sauvegardes et paramètres.',
    descriptionEn: 'Accounts, groups, backups and settings.',
  },
];

/** Ce que l'écran de connexion sait de l'établissement, avant qu'on soit connecté. */
export type ContexteSimule = {
  poste: string;
  gerantDeLaSemaine: string;
  responsableProduction: string;
  /** Caissier qui a ouvert la session en cours. */
  caissierDeSession: string;
  /** Semaine de travail en cours ; dates ISO. */
  semaine: { numero: number; du: string; au: string };
  /** Heure d'ouverture de la session en cours, « HH:MM ». */
  sessionOuverteDepuis: string;
  /** Créneau de la session en cours ou de la dernière session ; absent : celui de l'horloge. */
  sessionType?: 'jour' | 'nuit';
  /** La session est ouverte (faux : clôturée). Absent : ouverte. */
  sessionOuverte?: boolean;
};
