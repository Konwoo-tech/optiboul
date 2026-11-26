import type { Profil } from '../../../profils.ts';

/** Canal du code de double authentification (cahier des charges §4.2). */
export type Canal = 'sms' | 'whatsapp';

export type Groupe = {
  id: string;
  nom: string;
  /** Nom anglais ; absent pour un groupe créé à l'écran. */
  nomEn?: string;
  profil: Profil;
  description: string;
  descriptionEn?: string;
  /** Groupe de départ : le serveur refuse de le supprimer. */
  protege?: boolean;
};

export type Utilisateur = {
  id: string;
  nom: string;
  profil: Profil;
  email: string;
  /** « 6 77 41 20 18 » : le +237 est ajouté à l'affichage. */
  telephone: string;
  groupe: string;
  actif: boolean;
  /** « AAAA-MM-JJTHH:MM », heure de Yaoundé ; vide : jamais connecté. */
  dernierAcces: string;
  canal: Canal;
  /** Vrai serveur : le compte est bloqué après trop de codes faux. */
  bloque?: boolean;
};

/** Ce que l'écran lit : les comptes, les groupes, et qui regarde (pour verrouiller son compte). */
export type InstantaneUtilisateurs = {
  moi: string;
  utilisateurs: Utilisateur[];
  groupes: Groupe[];
};

export type NouvelUtilisateur = {
  nom: string;
  email: string;
  telephone: string;
  groupe: string;
  canal: Canal;
  invitation: boolean;
};

export type NouveauGroupe = { nom: string; profil: Profil; description: string };

/** Champs d'un formulaire, pour poser une erreur sous le bon. */
export type ChampUtilisateur = 'nom' | 'email' | 'telephone' | 'groupe';

/** Code d'erreur de validation d'un champ (jamais un texte : il est traduit à l'affichage). */
export type CodeErreurChamp =
  | 'nom_obligatoire'
  | 'nom_trop_long'
  | 'email_trop_long'
  | 'email_invalide'
  | 'email_deja_utilise'
  | 'telephone_invalide'
  | 'groupe_obligatoire';

export type ErreursUtilisateur = Partial<Record<ChampUtilisateur, CodeErreurChamp>>;

export type ReponseCreation = {
  utilisateur: Utilisateur;
  instantane: InstantaneUtilisateurs;
  /** Vrai serveur : codes de secours, montrés une seule fois à la création. */
  codesSecours?: string[];
};
