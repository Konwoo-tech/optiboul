import { optiboulFetch } from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  FermetureDemandee,
  OuvertureDemandee,
  ReouvertureDemandee,
  RemiseDemandee,
  RemiseEnregistree,
  ReponseCaisses,
} from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit l'API simulée (`/api/v1/simulation/caisses/`).
const RACINE = '/api/v1/simulation/caisses/';
const JSON_ENTETES = { 'Content-Type': 'application/json' };

type Reponse<T> = { data: T };

const poster = <T = undefined>(chemin: string, corps: object) =>
  optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
    method: 'POST',
    headers: JSON_ENTETES,
    body: JSON.stringify(corps),
  });

/** Clé des caisses : elle contient la personne connectée, pour ne jamais montrer celles d'une autre. */
export const cleCaisses = (utilisateur: string | undefined) =>
  ['comptoir', 'caisses', utilisateur] as const;

/** Caisses visibles par la personne connectée (la caissière ne reçoit que les siennes). */
export function useCaisses(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleCaisses(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<ReponseCaisses>>(RACINE)).data,
    enabled: SIMULATION && Boolean(utilisateur),
    // Les espèces bougent à chaque livraison et chaque dépense : on relit à chaque ouverture de l'écran.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action sur les caisses, puis rechargement de la liste. */
function useActionCaisse<Demande extends object, Resultat = undefined>(
  utilisateur: string | undefined,
  chemin: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande) => (await poster<Resultat>(chemin, demande)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: cleCaisses(utilisateur) }),
  });
}

export const useOuvrirCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<OuvertureDemandee>(utilisateur, 'ouvrir/');

export const useFermerCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<FermetureDemandee>(utilisateur, 'fermer/');

export const useRouvrirCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<ReouvertureDemandee>(utilisateur, 'rouvrir/');

export const useRemettreAuCoffre = (utilisateur: string | undefined) =>
  useActionCaisse<RemiseDemandee, RemiseEnregistree>(utilisateur, 'remettre/');
