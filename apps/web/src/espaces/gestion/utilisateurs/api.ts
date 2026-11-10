import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InstantaneUtilisateurs, NouveauGroupe } from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/utilisateurs.ts`).
const RACINE = '/api/v1/simulation/gestion/utilisateurs/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleUtilisateurs = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'utilisateurs', utilisateur] as const;

export function useUtilisateurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleUtilisateurs(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneUtilisateurs>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function envoyer<T>(chemin: string, methode: string, corps?: unknown): Promise<T> {
  return (
    await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
      method: methode,
      ...(corps === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
    })
  ).data;
}

/** Une action sur les comptes : l'écran prend l'instantané renvoyé et relit ce qui en dépend. */
function useAction<Demande>(
  utilisateur: string | undefined,
  action: (demande: Demande) => Promise<InstantaneUtilisateurs>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (resultat) => {
      client.setQueryData(cleUtilisateurs(utilisateur), resultat);
      // La liste de l'écran de connexion, les affectations de semaine et le contexte en dépendent.
      void client.invalidateQueries({ queryKey: ['simulation', 'utilisateurs'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'semaines'] });
    },
  });
}

export const useChangerDeGroupe = (utilisateur: string | undefined) =>
  useAction<{ id: string; groupe: string }>(utilisateur, (d) =>
    envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(d.id)}/groupe/`, 'PUT', {
      groupe: d.groupe,
    }),
  );
export const useReinitialiserLeCode = (utilisateur: string | undefined) =>
  useAction<string>(utilisateur, (id) =>
    envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(id)}/reinitialiser-code/`, 'POST'),
  );
export const useActiver = (utilisateur: string | undefined) =>
  useAction<{ id: string; actif: boolean }>(utilisateur, (d) =>
    envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(d.id)}/activation/`, 'PUT', {
      actif: d.actif,
    }),
  );

export const useCreerUnGroupe = (utilisateur: string | undefined) =>
  useAction<NouveauGroupe>(utilisateur, (g) =>
    envoyer<InstantaneUtilisateurs>('groupes/', 'POST', g),
  );

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
