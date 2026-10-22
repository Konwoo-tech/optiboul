import { optiboulFetch } from '@/api';
import { useQuery } from '@tanstack/react-query';

import { SIMULATION } from './actif.ts';
import type { ContexteSimule, UtilisateurSimule } from './donnees.ts';
import type { NotificationSimulee } from './notifications.ts';
import type { Canal, Via } from './routeur.ts';

type Reponse<T> = { data: T };

const JSON_ENTETES = { 'Content-Type': 'application/json' };

const poster = <T = undefined>(chemin: string, corps?: object) =>
  optiboulFetch<Reponse<T>>(`/api/v1/simulation/${chemin}`, {
    method: 'POST',
    headers: JSON_ENTETES,
    body: corps ? JSON.stringify(corps) : undefined,
  });

/**
 * Comptes proposés sur l'écran de connexion (le vrai backend n'a pas encore cette route).
 * Seuls les écrans de connexion affichés en simulation l'appellent.
 */
export function useUtilisateursSimules() {
  return useQuery({
    queryKey: ['simulation', 'utilisateurs'],
    queryFn: async () =>
      (await optiboulFetch<Reponse<UtilisateurSimule[]>>('/api/v1/simulation/utilisateurs/')).data,
    staleTime: Infinity,
  });
}

/** Gérant de la semaine et poste, affichés à gauche de l'écran de connexion. */
export function useContexteSimule() {
  return useQuery({
    queryKey: ['simulation', 'contexte'],
    queryFn: async () =>
      (await optiboulFetch<Reponse<ContexteSimule>>('/api/v1/simulation/contexte/')).data,
    enabled: SIMULATION,
    staleTime: Infinity,
  });
}

export type Identification =
  | { methode: 'code'; utilisateur: string; code: string }
  | { methode: 'email'; email: string; motDePasse: string }
  | { methode: 'google'; email: string };

export type ReponseIdentification =
  | { deuxFacteurs: false }
  | {
      deuxFacteurs: true;
      utilisateur: UtilisateurSimule;
      telephoneMasque: string;
      via: Via;
    };

/** Première étape : qui êtes-vous ? Ouvre la session, ou attend la double authentification. */
export async function identifier(
  identification: Identification,
  deuxFacteurs: boolean,
): Promise<ReponseIdentification> {
  const reponse = await poster<ReponseIdentification>('identification/', {
    ...identification,
    deuxFacteurs,
  });
  return reponse.data;
}

export async function annulerIdentification(): Promise<void> {
  await poster('identification/annuler/');
}

/** Envoie le code à 6 chiffres. Renvoie l'heure d'envoi, « HH:MM ». */
export async function envoyerCodeOtp(canal: Canal): Promise<string> {
  const reponse = await poster<{ heure: string }>('otp/envoyer/', { canal });
  return reponse.data.heure;
}

/** Deuxième étape. Une erreur `code_incorrect` porte `details.essaisRestants`. */
export async function verifierCodeOtp(code: string): Promise<void> {
  await poster('otp/verifier/', { code });
}

export async function deconnecterSimulation(): Promise<void> {
  await poster('deconnexion/');
}

export type NotificationVue = NotificationSimulee & { lue: boolean };

/**
 * Notifications de la personne connectée. La clé contient son nom : après un changement
 * d'utilisateur, on ne montre pas celles de la personne précédente.
 */
export function useNotificationsSimulees(utilisateur: string | undefined) {
  return useQuery({
    queryKey: ['simulation', 'notifications', utilisateur],
    queryFn: async () =>
      (await optiboulFetch<Reponse<NotificationVue[]>>('/api/v1/simulation/notifications/')).data,
    enabled: SIMULATION && Boolean(utilisateur),
  });
}

export async function marquerNotificationsLues(ids: string[]): Promise<void> {
  await poster('notifications/lues/', { ids });
}
