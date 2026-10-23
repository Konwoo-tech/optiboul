import { optiboulFetch } from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ReponseDecision, ReponseDemandes } from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit l'API simulée (`/api/v1/simulation/demandes/`).
const RACINE = '/api/v1/simulation/demandes/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleDemandes = (utilisateur: string | undefined) =>
  ['simulation', 'demandes', utilisateur] as const;

export function useDemandes(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleDemandes(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<ReponseDemandes>>(RACINE)).data,
    enabled: SIMULATION && Boolean(utilisateur),
    // Une demande peut arriver depuis la session : on relit à chaque ouverture de l'écran.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Accorde ou refuse une demande, puis relit la liste et la session (autorisation de plafond). */
export function useDecider(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accord }: { id: string; accord: boolean }) =>
      (
        await optiboulFetch<Reponse<ReponseDecision>>(`${RACINE}${id}/decider/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accord }),
        })
      ).data,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cleDemandes(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'session'] }),
        // Accorder ou refuser une dépense change son statut, le budget, la clôture et la caisse.
        client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'depenses'] }),
        client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] }),
        // Un inventaire accordé ajuste le stock et change de statut.
        client.invalidateQueries({ queryKey: ['simulation', 'atelier', 'stocks'] }),
      ]),
  });
}
