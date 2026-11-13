import { ErreurApi, optiboulFetch } from '@/api';
import { SIMULATION } from '@/simulation';
import { useQuery } from '@tanstack/react-query';

import { lireTableauDeBordReel } from './reel.ts';
import type { InstantaneTableauDeBord } from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/tableauDeBord.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = '/api/v1/simulation/gestion/tableau-de-bord/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleTableauDeBord = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'tableau-de-bord', utilisateur] as const;

export function useTableauDeBord(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleTableauDeBord(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantaneTableauDeBord>>(RACINE)).data
        : lireTableauDeBordReel(),
    enabled: Boolean(utilisateur),
    // Les chiffres bougent depuis les autres écrans (session, dépenses, demandes…) : on relit à
    // chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
