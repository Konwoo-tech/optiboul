import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstantaneSemaines, NouveauCreneau, NouvelleAffectation } from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/semaines.ts`).
const RACINE = '/api/v1/simulation/gestion/semaines/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSemaines = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'semaines', utilisateur] as const;

export function useSemaines(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSemaines(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneSemaines>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // Les caisses, les dépenses et les demandes bougent ailleurs : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function publier(chemin: string, corps: unknown): Promise<InstantaneSemaines> {
  return (
    await optiboulFetch<Reponse<InstantaneSemaines>>(`${RACINE}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
  ).data;
}

/** Une action sur les semaines : l'écran prend l'instantané renvoyé, la coque relit son contexte. */
function useActionSemaines<Demande>(utilisateur: string | undefined, chemin: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (demande: Demande) => publier(chemin, demande),
    onSuccess: (instantane) => {
      client.setQueryData(cleSemaines(utilisateur), instantane);
      // L'ouverture et la clôture changent la semaine, le gérant et le responsable de l'en-tête,
      // et la caissière prévue sur le prochain créneau de la caisse.
      void client.invalidateQueries({ queryKey: ['simulation', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] });
    },
  });
}

export const useAffecter = (utilisateur: string | undefined) =>
  useActionSemaines<NouvelleAffectation>(utilisateur, 'affectations/');
export const usePlanifier = (utilisateur: string | undefined) =>
  useActionSemaines<NouveauCreneau>(utilisateur, 'planning/');
export const useOuvrirSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string }>(utilisateur, 'ouvrir/');
export const useCloturerSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string }>(utilisateur, 'cloturer/');

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
