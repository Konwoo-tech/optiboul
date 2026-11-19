import {
  ErreurApi,
  groupesList,
  toutesLesPages,
  usersMeRetrieve,
  utilisateursList,
  type Compte,
  type Groupe as GroupeServeur,
} from '@/api';

import type { Profil } from '../../../profils.ts';
import type {
  ChampUtilisateur,
  CodeErreurChamp,
  ErreursUtilisateur,
  Groupe,
  InstantaneUtilisateurs,
  Utilisateur,
} from './types.ts';

/*
 * Lecture de « Gestion › Utilisateurs » sur le vrai serveur : `utilisateurs/` et `groupes/`
 * (administrateur seulement). Le compte du serveur ne porte ni téléphone, ni canal, ni dernier accès,
 * ni activation : ces informations restent vides à l'écran (voir E47).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

export function versGroupe(g: GroupeServeur): Groupe {
  return {
    id: String(g.id),
    nom: g.nom,
    profil: g.profil as Profil,
    description: g.description ?? '',
  };
}

export function versUtilisateur(c: Compte): Utilisateur | undefined {
  if (!c.profil) return undefined;
  return {
    id: String(c.id),
    nom: c.name,
    profil: c.profil as Profil,
    email: c.email,
    telephone: '',
    groupe: c.groupe === null ? '' : String(c.groupe),
    actif: c.is_active,
    dernierAcces: '',
    canal: 'whatsapp',
    bloque: c.bloque,
  };
}

export async function lireUtilisateursReels(): Promise<InstantaneUtilisateurs> {
  const [moi, comptes, groupes] = await Promise.all([
    usersMeRetrieve().then((r) => r.data as unknown as { url: string }),
    toutesLesPages<Compte>((page) => utilisateursList({ page }) as Promise<Page<Compte>>),
    toutesLesPages<GroupeServeur>((page) => groupesList({ page }) as Promise<Page<GroupeServeur>>),
  ]);
  return {
    moi: /\/(\d+)\/?$/.exec(moi.url)?.[1] ?? '',
    utilisateurs: comptes.flatMap((c) => versUtilisateur(c) ?? []),
    groupes: groupes.map(versGroupe),
  };
}

/** « 6 77 41 20 18 » (saisie de l'écran) devient « +237677412018 » (le serveur veut 9 chiffres en 6). */
export const telephoneDuServeur = (saisi: string) => `+237${saisi.replace(/\D/g, '')}`;

const CODES: Record<ChampUtilisateur, (message: string) => CodeErreurChamp> = {
  nom: () => 'nom_obligatoire',
  email: (m) => (/déjà/.test(m) ? 'email_deja_utilise' : 'email_invalide'),
  telephone: () => 'telephone_invalide',
  groupe: () => 'groupe_obligatoire',
};

/**
 * Un refus de validation du serveur (`{champ: ["message"]}`) devient l'erreur par champ de l'écran.
 * Toute autre réponse est rendue telle quelle.
 */
export function enErreurDeChamps(erreur: unknown): unknown {
  if (!(erreur instanceof ErreurApi) || erreur.status !== 400 || erreur.code) return erreur;
  const corps = (erreur.details ?? {}) as Record<string, unknown>;
  const erreurs: ErreursUtilisateur = {};
  for (const champ of Object.keys(CODES) as ChampUtilisateur[]) {
    const messages = corps[champ];
    if (Array.isArray(messages) && messages.length) {
      erreurs[champ] = CODES[champ](String(messages[0]));
    }
  }
  return Object.keys(erreurs).length
    ? new ErreurApi(400, { code: 'champs_invalides', detail: 'Champs invalides', erreurs })
    : erreur;
}
