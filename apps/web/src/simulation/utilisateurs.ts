import {
  aDesErreurs,
  formaterTelephone,
  identifiantDe,
  nomDeGroupePris,
  nomDeGroupeValide,
  normaliserEmail,
  DESCRIPTION_DE_GROUPE_MAX,
  NOM_DE_GROUPE_MAX,
  PROFILS_DE_DROITS,
  peutAdministrer,
  validerNouvelUtilisateur,
} from '@/espaces/gestion/utilisateurs/regles.ts';
import type {
  Canal,
  InstantaneUtilisateurs,
  Utilisateur,
} from '@/espaces/gestion/utilisateurs/types.ts';

import {
  affecterAuGroupe,
  ajouterCompte,
  ajouterGroupe,
  compteParId,
  comptesActifs,
  definirActivation,
  groupeParId,
  tousLesComptes,
  tousLesGroupes,
  type CompteVivant,
} from './comptes.ts';
import type { Profil } from '@/profils.ts';
import { dateDuJour, heureCourante } from './comptoir.ts';
import type { GroupeSimule } from './donnees.ts';
import { consigner } from './journal.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Gestion › Utilisateurs » (US-020 à US-022) : comptes, groupes, changement de
 * groupe, réinitialisation du code, activation. Les comptes eux-mêmes vivent dans `comptes.ts`
 * (une seule source pour la connexion, la session et les plannings) ; ce module ajoute les
 * contrôles, le droit (administrateur seul), le journal et la file d'invitations. Tout vit en
 * mémoire.
 */

type Corps = Record<string, unknown>;
type Journal = { heure: string; qui: string; quoi: string };
type Invitation = { utilisateur: string; canal: Canal; envoyeeLe: string };

const RACINE = '/api/v1/simulation/gestion/utilisateurs/';

const probleme = (status: number, code: string, detail: string, autres: object = {}) =>
  Response.json({ detail, code, ...autres }, { status });
const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

const NOM_DU_PROFIL: Record<string, string> = {
  caissier: 'Caissier',
  gerant: 'Gérant de la semaine',
  production: 'Chef de production',
  proprietaire: 'Propriétaire',
  administrateur: 'Administrateur',
};

let journal: Journal[] = [];
let invitations: Invitation[] = [];
let sequence = 0;

/** Remet le journal et la file d'invitations à zéro (tests). */
export function reinitialiserUtilisateurs(): void {
  journal = [];
  invitations = [];
  sequence = 0;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export const journalUtilisateurs = (): readonly Journal[] => journal;

/** Invitations mises en file d'envoi, plus récentes en premier (tests). */
export const invitationsEnFile = (): readonly Invitation[] => invitations;

const tracer = (qui: string, quoi: string) => {
  journal = [{ heure: heureCourante(), qui, quoi }, ...journal];
  consigner({ auteur: qui, type: 'utilisateur', texte: quoi });
};

const projeter = (c: CompteVivant): Utilisateur => ({
  id: c.id,
  nom: c.nom,
  profil: c.profil,
  email: c.email,
  telephone: c.telephone,
  groupe: c.groupe,
  actif: c.actif,
  dernierAcces: c.dernierAcces,
  canal: c.canal,
});

const instantane = (moi: string): InstantaneUtilisateurs => ({
  moi,
  utilisateurs: tousLesComptes().map(projeter),
  groupes: tousLesGroupes().map((g) => ({ ...g })),
});

const texte = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '');

type Acteur = { id: string; nom: string; profil: Profil };

function creerUnUtilisateur(a: Acteur, corps: Corps): Response {
  const nom = texte(corps.nom);
  const email = texte(corps.email);
  const telephone = texte(corps.telephone);
  const groupe = texte(corps.groupe);
  const canal = corps.canal;
  if (canal !== 'sms' && canal !== 'whatsapp') {
    return probleme(400, 'canal_inconnu', 'Canal de vérification inconnu.');
  }
  const erreurs = validerNouvelUtilisateur(
    { nom, email, telephone, groupe },
    tousLesComptes().map((c) => c.email),
    tousLesGroupes().map((g) => g.id),
  );
  if (aDesErreurs(erreurs)) {
    return probleme(400, 'champs_invalides', 'Certains champs sont invalides.', { erreurs });
  }
  const choisi = groupeParId(groupe)!;
  sequence += 1;
  const compte: CompteVivant = {
    id: identifiantDe(
      email,
      tousLesComptes().map((c) => c.id),
      sequence,
    ),
    nom: nom.trim(),
    profil: choisi.profil,
    email: normaliserEmail(email),
    telephone: formaterTelephone(telephone),
    groupe: choisi.id,
    dernierAcces: '',
    actif: true,
    canal,
  };
  ajouterCompte(a.profil, compte);
  // Défense en profondeur : seul un vrai « false » retire l'invitation. Un booléen absent ou d'un
  // autre type (« non », 0, null) est ignoré et l'invitation part : mieux vaut envoyer un lien de
  // connexion de trop que laisser un compte créé sans moyen de se connecter.
  const invite = corps.invitation !== false;
  if (invite) {
    invitations = [
      { utilisateur: compte.id, canal, envoyeeLe: `${dateDuJour()}T${heureCourante()}` },
      ...invitations,
    ];
  }
  tracer(
    a.nom,
    `Création de l’utilisateur ${compte.nom} (${compte.email}) · groupe ${choisi.nom}${
      invite ? ` · invitation envoyée par ${canal === 'sms' ? 'SMS' : 'WhatsApp'}` : ''
    }`,
  );
  return Response.json(
    { utilisateur: projeter(compte), instantane: instantane(a.id), invitation: invite },
    { status: 201 },
  );
}

/**
 * Garde explicite : l'unique administrateur actif ne peut ni être désactivé ni quitter le profil
 * administrateur, sinon plus personne ne gère les comptes (cahier des charges §3.3).
 */
const estLeDernierAdministrateur = (compte: CompteVivant): boolean =>
  compte.actif &&
  compte.profil === 'administrateur' &&
  comptesActifs().filter((c) => c.profil === 'administrateur').length <= 1;

const DERNIER_ADMINISTRATEUR = () =>
  probleme(409, 'dernier_administrateur', 'Il doit rester au moins un administrateur actif.');

function changerDeGroupe(a: Acteur, id: string, corps: Corps): Response {
  const compte = compteParId(id);
  if (!compte) return probleme(404, 'utilisateur_inconnu', 'Utilisateur inconnu.');
  const groupe = groupeParId(texte(corps.groupe));
  if (!groupe) return probleme(404, 'groupe_inconnu', 'Groupe inconnu.');
  if (estLeDernierAdministrateur(compte) && groupe.profil !== 'administrateur') {
    return DERNIER_ADMINISTRATEUR();
  }
  if (compte.id === a.id) {
    return probleme(409, 'compte_propre', 'Vous ne pouvez pas changer votre propre groupe.');
  }
  affecterAuGroupe(a.profil, id, groupe);
  tracer(a.nom, `Changement de groupe : ${compte.nom} → ${groupe.nom}`);
  return Response.json(instantane(a.id));
}

function reinitialiserLeCode(a: Acteur, id: string): Response {
  const compte = compteParId(id);
  if (!compte) return probleme(404, 'utilisateur_inconnu', 'Utilisateur inconnu.');
  tracer(a.nom, `Réinitialisation du code de ${compte.nom}`);
  return Response.json(instantane(a.id));
}

function activer(a: Acteur, id: string, corps: Corps): Response {
  const compte = compteParId(id);
  if (!compte) return probleme(404, 'utilisateur_inconnu', 'Utilisateur inconnu.');
  if (typeof corps.actif !== 'boolean') {
    return probleme(400, 'actif_invalide', 'Indiquez si le compte est actif.');
  }
  if (corps.actif === false && estLeDernierAdministrateur(compte)) return DERNIER_ADMINISTRATEUR();
  if (compte.id === a.id) {
    return probleme(409, 'compte_propre', 'Vous ne pouvez pas désactiver votre propre compte.');
  }
  definirActivation(a.profil, id, corps.actif);
  tracer(a.nom, `${corps.actif ? 'Réactivation' : 'Désactivation'} du compte ${compte.nom}`);
  return Response.json(instantane(a.id));
}

function creerUnGroupe(a: Acteur, corps: Corps): Response {
  const nom = texte(corps.nom);
  if (!nomDeGroupeValide(nom))
    return probleme(400, 'nom_obligatoire', 'Indiquez le nom du groupe.');
  if (nom.trim().length > NOM_DE_GROUPE_MAX) {
    return probleme(400, 'nom_trop_long', 'Le nom du groupe est trop long.');
  }
  if (texte(corps.description).trim().length > DESCRIPTION_DE_GROUPE_MAX) {
    return probleme(400, 'description_trop_longue', 'La description est trop longue.');
  }
  const profil = PROFILS_DE_DROITS.find((p) => p === corps.profil);
  if (!profil) return probleme(400, 'profil_inconnu', 'Profil de droits inconnu.');
  if (nomDeGroupePris(nom, tousLesGroupes())) {
    return probleme(409, 'groupe_existant', 'Un groupe porte déjà ce nom.');
  }
  sequence += 1;
  const groupe: GroupeSimule = {
    id: `g${tousLesGroupes().length + 1}-${sequence}`,
    nom: nom.trim(),
    profil,
    description: texte(corps.description).trim(),
  };
  ajouterGroupe(a.profil, groupe);
  tracer(a.nom, `Création du groupe ${groupe.nom} (${NOM_DU_PROFIL[profil]})`);
  return Response.json(instantane(a.id), { status: 201 });
}

/** Réponses de « Gestion › Utilisateurs » ; `undefined` pour une route qui n'est pas la sienne. */
export function repondreUtilisateurs(
  url: URL,
  methode: string,
  corps: Corps,
): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  const connecte = lireUtilisateurConnecte();
  if (!connecte) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutAdministrer(connecte.profil)) return refus();
  const a: Acteur = { id: connecte.id, nom: connecte.nom, profil: connecte.profil };

  const sur = /^(PUT|POST) ([^/]+)\/(groupe|reinitialiser-code|activation)\/$/.exec(appel);
  if (sur) {
    const [, , id, action] = sur;
    if (action === 'groupe' && methode === 'PUT') return changerDeGroupe(a, id!, corps);
    if (action === 'reinitialiser-code' && methode === 'POST') return reinitialiserLeCode(a, id!);
    if (action === 'activation' && methode === 'PUT') return activer(a, id!, corps);
    return undefined;
  }

  switch (appel) {
    case 'GET ':
      return Response.json(instantane(a.id));
    case 'POST ':
      return creerUnUtilisateur(a, corps);
    case 'POST groupes/':
      return creerUnGroupe(a, corps);
    default:
      return undefined;
  }
}
