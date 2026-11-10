import { ecransDe, type CleEcran } from '../../../navigation.ts';
import type { Espace, Profil } from '../../../profils.ts';
import type { ErreursUtilisateur, Groupe, NouvelUtilisateur, Utilisateur } from './types.ts';

/*
 * Règles de « Gestion › Utilisateurs » (cahier des charges §3.2 et §5.13, maquette « OptiBoul
 * ERP v2 », fonction `vUsers`). Python pur côté serveur, ici TypeScript pur : le faux serveur et
 * l'écran appliquent exactement les mêmes contrôles.
 */

/** Seul l'administrateur gère les comptes et les groupes (§3.3 : « Comptes, groupes, sauvegardes »). */
export const peutAdministrer = (profil: Profil | null | undefined): boolean =>
  profil === 'administrateur';

/** Profils de droits, dans l'ordre de la maquette (`ROLE`). */
export const PROFILS_DE_DROITS: readonly Profil[] = [
  'caissier',
  'gerant',
  'production',
  'proprietaire',
  'administrateur',
];

// ---------------------------------------------------------------------------
// Téléphone
// ---------------------------------------------------------------------------

/** Saisie du téléphone : chiffres et espaces seulement, 14 caractères au plus (maquette : `setN`). */
export const saisirTelephone = (saisi: string): string => saisi.replace(/[^\d ]/g, '').slice(0, 14);

const chiffres = (texte: string) => texte.replace(/\D/g, '');

/** « 677412018 » → « 6 77 41 20 18 », forme sous laquelle un numéro est enregistré. */
export const formaterTelephone = (saisi: string): string =>
  chiffres(saisi).replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');

/** Aperçu du numéro pendant la saisie : « +237 6 77 … » ou « +237 … » (maquette : `mask`). */
export function apercuTelephone(saisi: string): string {
  const d = chiffres(saisi);
  if (!d) return '+237 …';
  return `+237 ${d.replace(/^(\d)(\d{0,2})(\d{0,2})(\d{0,2})(\d{0,2}).*/, '$1 $2 $3 $4 $5').trim()}`;
}

// ---------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------

const FORME_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/;
const FORME_TELEPHONE = /^6\d{8}$/;

export const normaliserEmail = (saisi: string): string => saisi.trim().toLowerCase();

/**
 * Contrôles de la création (US-020) : nom, e-mail valide et unique, téléphone à 9 chiffres
 * commençant par 6, groupe obligatoire. Renvoie un code par champ en erreur, jamais un texte.
 */
export function validerNouvelUtilisateur(
  entree: Pick<NouvelUtilisateur, 'nom' | 'email' | 'telephone' | 'groupe'>,
  emailsPris: readonly string[],
  groupesConnus?: readonly string[],
): ErreursUtilisateur {
  const erreurs: ErreursUtilisateur = {};
  const email = normaliserEmail(entree.email);
  if (!entree.nom.trim()) erreurs.nom = 'nom_obligatoire';
  if (!FORME_EMAIL.test(email)) erreurs.email = 'email_invalide';
  else if (emailsPris.includes(email)) erreurs.email = 'email_deja_utilise';
  if (!FORME_TELEPHONE.test(chiffres(entree.telephone))) erreurs.telephone = 'telephone_invalide';
  if (!entree.groupe || (groupesConnus && !groupesConnus.includes(entree.groupe))) {
    erreurs.groupe = 'groupe_obligatoire';
  }
  return erreurs;
}

export const aDesErreurs = (erreurs: ErreursUtilisateur): boolean =>
  Object.keys(erreurs).length > 0;

/** Un groupe a besoin d'un nom (US-021). */
export const nomDeGroupeValide = (nom: string): boolean => nom.trim().length > 0;

/** Longueurs maximales d'un nom et d'une description de groupe (client et serveur). */
export const NOM_DE_GROUPE_MAX = 60;
export const DESCRIPTION_DE_GROUPE_MAX = 200;

/** Deux groupes ne portent pas le même nom (sans tenir compte des majuscules). */
export const nomDeGroupePris = (nom: string, groupes: readonly Pick<Groupe, 'nom'>[]): boolean =>
  groupes.some((g) => g.nom.trim().toLocaleLowerCase('fr') === nom.trim().toLocaleLowerCase('fr'));

/**
 * Identifiant d'un nouveau compte : la partie locale de l'e-mail, en minuscules alphanumériques
 * (16 caractères au plus), suivie d'un rang à trois chiffres ; le rang monte tant qu'il est pris.
 */
export function identifiantDe(email: string, pris: readonly string[], rang: number): string {
  const base = normaliserEmail(email)
    .split('@')[0]!
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16);
  let suivant = rang;
  let id = `${base}${String(suivant).padStart(3, '0')}`;
  while (pris.includes(id)) {
    suivant += 1;
    id = `${base}${String(suivant).padStart(3, '0')}`;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Lecture de la liste
// ---------------------------------------------------------------------------

export const membresDuGroupe = (utilisateurs: readonly Utilisateur[], groupe: string) =>
  utilisateurs.filter((u) => u.groupe === groupe);

/** Nom d'un groupe dans la langue : l'anglais s'il existe, sinon le nom saisi. */
export const nomDuGroupe = (groupe: Groupe | undefined, langue: string): string =>
  !groupe ? '—' : langue.startsWith('en') && groupe.nomEn ? groupe.nomEn : groupe.nom;

export const descriptionDuGroupe = (groupe: Groupe, langue: string): string =>
  langue.startsWith('en') && groupe.descriptionEn ? groupe.descriptionEn : groupe.description;

// ---------------------------------------------------------------------------
// Accès de l'application
// ---------------------------------------------------------------------------

/** Ordre des entrées dans l'aperçu des accès : celui du menu à plat de la maquette (`MENU`). */
const ORDRE_DU_MENU: readonly CleEcran[] = [
  'tableau-de-bord',
  'semaines',
  'session',
  'caisses',
  'clients',
  'production',
  'stocks',
  'fournisseurs',
  'depenses',
  'personnel',
  'demandes',
  'utilisateurs',
  'sauvegardes',
  'journal',
  'parametres',
];

const ESPACES: readonly Espace[] = ['comptoir', 'atelier', 'gestion'];

/**
 * Écrans que voit un profil dans l'application, dans l'ordre du menu de la maquette. La visibilité
 * vient de `navigation.ts`, seule source : aperçu et menu ne peuvent pas se contredire.
 */
export function ecransAccessibles(profil: Profil): CleEcran[] {
  const visibles = new Set(ESPACES.flatMap((e) => ecransDe(profil, e).map((ecran) => ecran.cle)));
  return ORDRE_DU_MENU.filter((cle) => visibles.has(cle));
}

// ---------------------------------------------------------------------------
// Dernier accès
// ---------------------------------------------------------------------------

const MOIS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
const MOIS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** « 2026-10-14T18:02 » → « 14 oct. 18:02 » (« Oct 14 18:02 » en anglais) ; « — » si jamais. */
export function formaterAcces(iso: string, langue: string): string {
  const trouve = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!trouve) return '—';
  const mois = Number(trouve[1]) - 1;
  const jour = Number(trouve[2]);
  return langue.startsWith('en')
    ? `${MOIS_EN[mois]} ${jour} ${trouve[3]}`
    : `${jour === 1 ? '1er' : jour} ${MOIS_FR[mois]} ${trouve[3]}`;
}

// ---------------------------------------------------------------------------
// Droits par profil (cahier des charges §3.3, maquette : `RM`)
// ---------------------------------------------------------------------------

export type Droit =
  | 'saisir'
  | 'voir'
  | 'demander'
  | 'autoriser'
  | 'oui'
  | 'saisirEtValider'
  | 'valider'
  | 'preparer'
  | 'non';

export type LigneDeDroits = {
  cle: string;
  /** Caissier, gérant, chef de production, propriétaire, administrateur. */
  droits: readonly [Droit, Droit, Droit, Droit, Droit];
};

export const MATRICE_DES_DROITS: readonly LigneDeDroits[] = [
  { cle: 'livraisons', droits: ['saisir', 'saisir', 'non', 'voir', 'non'] },
  { cle: 'plafond', droits: ['demander', 'autoriser', 'non', 'autoriser', 'non'] },
  { cle: 'cloturerSession', droits: ['oui', 'oui', 'non', 'oui', 'non'] },
  { cle: 'rouvrirSession', droits: ['non', 'oui', 'non', 'oui', 'non'] },
  { cle: 'cloturerSemaine', droits: ['non', 'oui', 'non', 'oui', 'non'] },
  { cle: 'production', droits: ['non', 'oui', 'saisir', 'voir', 'non'] },
  { cle: 'achats', droits: ['non', 'oui', 'non', 'voir', 'non'] },
  { cle: 'depenses', droits: ['saisir', 'saisirEtValider', 'non', 'valider', 'non'] },
  { cle: 'paie', droits: ['non', 'preparer', 'non', 'valider', 'non'] },
  { cle: 'tableauDeBord', droits: ['non', 'oui', 'non', 'oui', 'non'] },
  { cle: 'parametres', droits: ['non', 'oui', 'non', 'oui', 'oui'] },
  { cle: 'comptes', droits: ['non', 'non', 'non', 'non', 'oui'] },
];
