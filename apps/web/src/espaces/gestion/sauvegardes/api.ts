import { ErreurApi, optiboulFetch, sauvegardesLancerCreate } from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireSauvegardesReelles } from './reel.ts';
import type { InstantaneSauvegardes, ReponseCopie, ReponseRestauration } from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/sauvegardes.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = SIMULATION ? '/api/v1/simulation/gestion/sauvegardes/' : '';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSauvegardes = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'sauvegardes', utilisateur] as const;

export function useSauvegardes(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSauvegardes(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantaneSauvegardes>>(RACINE)).data
        : lireSauvegardesReelles(),
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function envoyer<T>(chemin: string): Promise<T> {
  return (await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, { method: 'POST' })).data;
}

/** Une action : l'écran prend l'instantané renvoyé, et le journal (qui a une ligne de plus) est relu. */
function useAction<Demande, Resultat extends { instantane: InstantaneSauvegardes }>(
  utilisateur: string | undefined,
  action: (demande: Demande) => Promise<Resultat>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (resultat) => {
      client.setQueryData(cleSauvegardes(utilisateur), resultat.instantane);
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'journal'] });
    },
  });
}

/**
 * Sur le vrai serveur, « lancer » met la sauvegarde en file (202) : on relit quelques fois jusqu'à ce
 * qu'une copie réussie plus récente apparaisse ; sinon la copie annoncée est celle de l'instant.
 */
async function lancerEtAttendre(genre: 'locale' | 'cloud'): Promise<ReponseCopie> {
  const avant = await lireSauvegardesReelles();
  const derniere = (i: InstantaneSauvegardes) => i.copies.find((c) => c.genre === genre)?.id;
  const idAvant = derniere(avant);
  await sauvegardesLancerCreate();
  let instantane = avant;
  for (let essai = 0; essai < 8; essai += 1) {
    await new Promise((resoudre) => setTimeout(resoudre, 1000));
    instantane = await lireSauvegardesReelles();
    const nouvelle = instantane.copies.find((c) => c.genre === genre && c.id !== idAvant);
    if (nouvelle) return { copie: nouvelle, instantane };
  }
  return {
    copie: { id: 'en-attente', genre, declencheur: 'manuelle', instant: new Date().toISOString() },
    instantane,
  };
}

export const useSauvegarderLocale = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () =>
    SIMULATION ? envoyer<ReponseCopie>('locale/') : lancerEtAttendre('locale'),
  );

export const useSauvegarderCloud = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () =>
    SIMULATION ? envoyer<ReponseCopie>('cloud/') : lancerEtAttendre('cloud'),
  );

/** Le serveur n'a pas de restauration par l'API (M4) : le bouton est masqué. */
export const useRestaurer = (utilisateur: string | undefined) =>
  useAction<string, ReponseRestauration>(utilisateur, (id) =>
    SIMULATION
      ? envoyer<ReponseRestauration>(`${encodeURIComponent(id)}/restaurer/`)
      : Promise.reject(new ErreurApi(409, { code: 'indisponible', detail: 'Pas de restauration' })),
  );

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
