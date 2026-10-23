import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  InstantaneStocks,
  Inventaire,
  Mouvement,
  NouveauMouvement,
  NouvelInventaire,
} from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/stocks.ts`).
const RACINE = '/api/v1/simulation/atelier/stocks/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleStocks = (utilisateur: string | undefined) =>
  ['simulation', 'atelier', 'stocks', utilisateur] as const;

export function useStocks(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleStocks(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneStocks>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // Le stock bouge depuis d'autres écrans (dépenses, demandes) : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function publier<T>(chemin: string, corps: unknown): Promise<T> {
  return (
    await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
  ).data;
}

export type MouvementEnregistre = { instantane: InstantaneStocks; mouvement: Mouvement };

export function useEnregistrerMouvement(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mouvement: NouveauMouvement) =>
      publier<MouvementEnregistre>('mouvements/', mouvement),
    onSuccess: (reponse) => client.setQueryData(cleStocks(utilisateur), reponse.instantane),
  });
}

export type InventaireEnregistre = {
  instantane: InstantaneStocks;
  inventaire: Inventaire;
  demande?: { numero: number };
};

export function useEnregistrerInventaire(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (inventaire: NouvelInventaire) =>
      publier<InventaireEnregistre>('inventaires/', inventaire),
    onSuccess: (reponse) => {
      client.setQueryData(cleStocks(utilisateur), reponse.instantane);
      void client.invalidateQueries({ queryKey: ['simulation', 'demandes'] });
      // Le rappel « Contrôle de stock à faire aujourd'hui » disparaît une fois le comptage fait.
      void client.invalidateQueries({ queryKey: ['simulation', 'notifications'] });
    },
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
