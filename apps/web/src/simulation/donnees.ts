import type { Profil } from '../profils.ts';

/** Compte tel que le serveur le connaît. Le téléphone ne quitte jamais le serveur en clair. */
export type CompteSimule = {
  id: string;
  nom: string;
  profil: Profil;
  email: string;
  telephone: string;
};

/** Ce que l'écran de connexion a le droit de voir d'un compte. */
export type UtilisateurSimule = Omit<CompteSimule, 'telephone'>;

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
  },
  {
    id: 'rachel',
    nom: 'Rachel',
    profil: 'caissier',
    email: 'rachel.boulfaubourg@gmail.com',
    telephone: '6 99 52 87 03',
  },
  {
    id: 'willy',
    nom: 'Willy',
    profil: 'gerant',
    email: 'willy.boulfaubourg@gmail.com',
    telephone: '6 55 18 64 90',
  },
  {
    id: 'serge',
    nom: 'Serge',
    profil: 'production',
    email: 'serge.boulfaubourg@gmail.com',
    telephone: '6 70 33 25 71',
  },
  {
    id: 'fotso',
    nom: 'M. Fotso',
    profil: 'proprietaire',
    email: 'fotso.boulfaubourg@gmail.com',
    telephone: '6 94 60 11 45',
  },
  {
    id: 'admin',
    nom: 'Support OptiBoul',
    profil: 'administrateur',
    email: 'support.optiboul@gmail.com',
    telephone: '6 58 72 09 36',
  },
  {
    id: 'patrick',
    nom: 'Patrick',
    profil: 'gerant',
    email: 'patrick.boulfaubourg@gmail.com',
    telephone: '6 77 90 14 52',
  },
  {
    id: 'christelle',
    nom: 'Christelle',
    profil: 'gerant',
    email: 'christelle.boulfaubourg@gmail.com',
    telephone: '6 99 31 68 27',
  },
  {
    id: 'ignace',
    nom: 'Ignace',
    profil: 'production',
    email: 'ignace.boulfaubourg@gmail.com',
    telephone: '6 55 84 03 19',
  },
];

export const UTILISATEURS_SIMULES: readonly UtilisateurSimule[] =
  /* @__PURE__ */ COMPTES_SIMULES.map(({ id, nom, profil, email }) => ({ id, nom, profil, email }));

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
};
