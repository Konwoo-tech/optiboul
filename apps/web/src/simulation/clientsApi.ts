import { optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SIMULATION } from './actif.ts';
import type { LigneHistoriqueClient, ListeClientsSimulee } from './clients.ts';

type Reponse<T> = { data: T };

const CLE = ['simulation', 'clients'] as const;

/**
 * Clients, soldes, plafond et échéance (route simulée stable `/api/v1/simulation/clients/`).
 * Lus par l'écran « Clients et dettes » et par l'écran « Session ».
 */
export function useClientsSimules() {
  return useQuery({
    queryKey: CLE,
    queryFn: async () =>
      (await optiboulFetch<Reponse<ListeClientsSimulee>>('/api/v1/simulation/clients/')).data,
    enabled: SIMULATION,
  });
}

/** Livraisons passées d'un client, de la plus récente à la plus ancienne. */
export function useHistoriqueClientSimule(id: string | null) {
  return useQuery({
    queryKey: [...CLE, id, 'historique'],
    queryFn: async () =>
      (
        await optiboulFetch<Reponse<LigneHistoriqueClient[]>>(
          `/api/v1/simulation/clients/${id}/historique/`,
        )
      ).data,
    enabled: SIMULATION && id !== null,
  });
}

/** Relance WhatsApp (simulée) d'un ou de plusieurs clients : gérant et propriétaire. */
export function useRelancerClientsSimules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (
        await optiboulFetch<Reponse<{ relances: number }>>('/api/v1/simulation/clients/relancer/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
      ).data,
    onSuccess: () => client.invalidateQueries({ queryKey: CLE }),
  });
}
