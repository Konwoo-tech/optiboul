import { ErreurApi, optiboulFetch } from '@/api';
import { useQuery } from '@tanstack/react-query';

import type { InstantaneJournal } from './types.ts';

// Le backend n'a pas encore cette route : l'écran lit le faux serveur (`simulation/journal.ts`).
const RACINE = '/api/v1/simulation/gestion/journal/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : rien ne fuit d'un compte à l'autre. */
export const cleJournal = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'journal', utilisateur] as const;

export function useJournal(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleJournal(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneJournal>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // D'autres écrans consignent des actions : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
