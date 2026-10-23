import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DemandeDepense, Depense, InstantaneDepenses, NouvelleDepense } from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/depenses.ts`).
const RACINE = '/api/v1/simulation/comptoir/depenses/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleDepenses = (utilisateur: string | undefined) =>
  ['simulation', 'comptoir', 'depenses', utilisateur] as const;

export function useDepenses(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleDepenses(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneDepenses>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // Les dépenses bougent depuis d'autres écrans (demandes) : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export type DepenseEnregistree = {
  instantane: InstantaneDepenses;
  depense: Depense;
  demande?: DemandeDepense;
};

export function useEnregistrerDepense(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (depense: NouvelleDepense) =>
      (
        await optiboulFetch<Reponse<DepenseEnregistree>>(RACINE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(depense),
        })
      ).data,
    onSuccess: (reponse) => {
      client.setQueryData(cleDepenses(utilisateur), reponse.instantane);
      // Une dépense payée en caisse change les espèces attendues de la caisse et de la clôture.
      void client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'session'] });
    },
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
