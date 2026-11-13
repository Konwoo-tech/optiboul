import { demandesAccorderCreate, demandesRefuserCreate, optiboulFetch } from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireDemandesReelles } from './reel.ts';
import type { ReponseDecision, ReponseDemandes } from './types.ts';

// En simulation, l'écran lit l'API simulée (`/api/v1/simulation/demandes/`) ; sur le vrai serveur,
// `reel.ts` lit `GET /demandes/`.
const RACINE = '/api/v1/simulation/demandes/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleDemandes = (utilisateur: string | undefined) =>
  ['simulation', 'demandes', utilisateur] as const;

export function useDemandes(utilisateur: string | undefined) {
  const { utilisateur: connecte } = useUtilisateurCourant();
  return useQuery({
    queryKey: cleDemandes(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<ReponseDemandes>>(RACINE)).data
        : lireDemandesReelles(connecte?.profil ?? undefined, connecte?.name ?? undefined),
    enabled: Boolean(utilisateur),
    // Une demande peut arriver depuis la session : on relit à chaque ouverture de l'écran.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Motif envoyé avec un refus (le serveur l'exige) : l'écran n'en demande pas. */
const MOTIF_DE_REFUS = 'Refusée depuis l’écran des demandes';

/** Accorde ou refuse une demande, puis relit la liste et la session (autorisation de plafond). */
export function useDecider(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accord }: { id: string; accord: boolean }): Promise<unknown> => {
      if (!SIMULATION) {
        // La personne connectée décide : le serveur vérifie qu'elle est valideur de cette demande.
        return accord
          ? demandesAccorderCreate(Number(id), {})
          : demandesRefuserCreate(Number(id), { motif: MOTIF_DE_REFUS });
      }
      return (
        await optiboulFetch<Reponse<ReponseDecision>>(`${RACINE}${id}/decider/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accord }),
        })
      ).data;
    },
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cleDemandes(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'session'] }),
        // Accorder ou refuser une dépense change son statut, le budget, la clôture et la caisse.
        client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'depenses'] }),
        client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] }),
        // Un inventaire accordé ajuste le stock et change de statut.
        client.invalidateQueries({ queryKey: ['simulation', 'atelier', 'stocks'] }),
        // Une augmentation de production accordée s'ajoute au plan, et ses notifications partent.
        client.invalidateQueries({ queryKey: ['simulation', 'atelier', 'production'] }),
        client.invalidateQueries({ queryKey: ['simulation', 'notifications'] }),
        client.invalidateQueries({ queryKey: ['coque', 'notifications'] }),
        // Un état de paie accordé ouvre le paiement ; refusé, il revient en brouillon.
        client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'personnel'] }),
      ]),
  });
}
