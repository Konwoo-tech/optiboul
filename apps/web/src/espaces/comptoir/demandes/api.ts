import { demandesAccorderCreate, demandesRefuserCreate } from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireDemandesReelles } from './reel.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleDemandes = (utilisateur: string | undefined) =>
  ['simulation', 'demandes', utilisateur] as const;

export function useDemandes(utilisateur: string | undefined) {
  const { utilisateur: connecte } = useUtilisateurCourant();
  return useQuery({
    queryKey: cleDemandes(utilisateur),
    queryFn: () => lireDemandesReelles(connecte?.profil ?? undefined, connecte?.name ?? undefined),
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
    mutationFn: async ({
      id,
      accord,
      motif,
    }: {
      id: string;
      accord: boolean;
      /** Motif d'un refus ; à défaut, un motif par défaut. */
      motif?: string;
    }): Promise<unknown> =>
      // La personne connectée décide : le serveur vérifie qu'elle est valideur de cette demande.
      accord
        ? demandesAccorderCreate(Number(id), {})
        : demandesRefuserCreate(Number(id), { motif: motif ?? MOTIF_DE_REFUS }),
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
