import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstantaneSauvegardes, ReponseCopie, ReponseRestauration } from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/sauvegardes.ts`).
const RACINE = '/api/v1/simulation/gestion/sauvegardes/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSauvegardes = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'sauvegardes', utilisateur] as const;

export function useSauvegardes(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSauvegardes(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneSauvegardes>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function envoyer<T>(chemin: string): Promise<T> {
  return (await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, { method: 'POST' })).data;
}

/** Une action : l'écran prend l'instantané renvoyé, et le journal (qui a une ligne de plus) est relu. */
function useAction<Demande, Resultat extends { instantane: InstantaneSauvegardes }>(
  utilisateur: string | undefined,
  action: (demande: Demande) => Promise<Resultat>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (resultat) => {
      client.setQueryData(cleSauvegardes(utilisateur), resultat.instantane);
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'journal'] });
    },
  });
}

export const useSauvegarderLocale = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () => envoyer<ReponseCopie>('locale/'));

export const useSauvegarderCloud = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () => envoyer<ReponseCopie>('cloud/'));

export const useRestaurer = (utilisateur: string | undefined) =>
  useAction<string, ReponseRestauration>(utilisateur, (id) =>
    envoyer<ReponseRestauration>(`${encodeURIComponent(id)}/restaurer/`),
  );

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
