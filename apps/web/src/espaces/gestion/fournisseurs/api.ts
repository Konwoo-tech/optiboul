import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Commande,
  Facture,
  InstantaneFournisseurs,
  NouveauPaiement,
  NouvelleCommande,
  NouvelleReception,
} from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/fournisseursApi.ts`).
const RACINE = '/api/v1/simulation/gestion/fournisseurs/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleFournisseurs = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'fournisseurs', utilisateur] as const;

export function useFournisseurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleFournisseurs(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneFournisseurs>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // Le stock, les semaines et les dépenses bougent ailleurs : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

type Resultat = {
  instantane: InstantaneFournisseurs;
  commande?: Commande;
  reliquat?: Commande;
  facture?: Facture;
  depense?: string;
};

async function publier(chemin: string, corps: unknown): Promise<Resultat> {
  return (
    await optiboulFetch<Reponse<Resultat>>(`${RACINE}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
  ).data;
}

/** Une action sur les fournisseurs : l'écran prend l'instantané renvoyé. */
function useAction<Demande>(utilisateur: string | undefined, chemin: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (demande: Demande) => publier(chemin, demande),
    onSuccess: (reponse) => {
      client.setQueryData(cleFournisseurs(utilisateur), reponse.instantane);
    },
    // Un 404 ou un 409 veut dire que la liste était périmée : on la relit.
    onError: () => void client.invalidateQueries({ queryKey: cleFournisseurs(utilisateur) }),
  });
}

export const usePlanifier = (u: string | undefined) => useAction<NouvelleCommande>(u, 'commandes/');
export const useReceptionner = (u: string | undefined) =>
  useAction<NouvelleReception>(u, 'receptions/');
export const useRelancer = (u: string | undefined) =>
  useAction<{ commande: string }>(u, 'relances/');
export const useReplanifier = (u: string | undefined) =>
  useAction<{ commande: string }>(u, 'reliquats/');
export const usePayer = (u: string | undefined) => useAction<NouveauPaiement>(u, 'paiements/');

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
