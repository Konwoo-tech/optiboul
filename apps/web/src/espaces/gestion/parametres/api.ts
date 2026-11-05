import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Parametre, ProduitParametre, ValeurParametre, ValeurPassee } from './types.ts';

// Le backend gèle encore ces routes pour l'écran : il lit le faux serveur (`simulation/parametres.ts`).
const RACINE = '/api/v1/simulation/gestion/parametres/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleParametres = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'parametres', utilisateur] as const;
export const cleProduits = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'parametres', 'produits', utilisateur] as const;
export const cleHistorique = (utilisateur: string | undefined, cle: string) =>
  ['simulation', 'gestion', 'parametres', 'historique', utilisateur, cle] as const;

export function useParametres(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleParametres(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<Parametre[]>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useProduits(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleProduits(utilisateur),
    queryFn: async () =>
      (await optiboulFetch<Reponse<ProduitParametre[]>>(`${RACINE}produits/`)).data,
    enabled: Boolean(utilisateur),
    // Les fiches se modifient dans l'atelier : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Historique des valeurs d'un paramètre, de la plus récente à la plus ancienne. */
export function useHistorique(utilisateur: string | undefined, cle: string) {
  return useQuery({
    queryKey: cleHistorique(utilisateur, cle),
    queryFn: async () =>
      (await optiboulFetch<Reponse<ValeurPassee[]>>(`${RACINE}${cle}/historique/`)).data,
    enabled: Boolean(utilisateur) && cle !== '',
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Le propriétaire enregistre une valeur ; la liste est remplacée par la réponse du serveur. */
export function useModifierParametre(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ cle, valeur }: { cle: string; valeur: ValeurParametre }) =>
      (
        await optiboulFetch<Reponse<Parametre>>(`${RACINE}${cle}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valeur }),
        })
      ).data,
    onSuccess: (parametre) => {
      client.setQueryData<Parametre[]>(cleParametres(utilisateur), (liste) =>
        liste?.map((p) => (p.cle === parametre.cle ? parametre : p)),
      );
      void client.invalidateQueries({
        queryKey: cleHistorique(utilisateur, parametre.cle),
      });
      // Les autres écrans lisent ces seuils (plafond de dette, validation des dépenses…) et le
      // journal reçoit la ligne : on les relit à leur prochaine ouverture.
      void client.invalidateQueries({ queryKey: ['simulation'], refetchType: 'none' });
    },
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
