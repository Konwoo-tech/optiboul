import { ErreurApi, optiboulFetch } from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type {
  Consommation,
  InstantaneFiches,
  InstantaneProduction,
  MotifEcart,
  MotifSupplement,
  ModificationFiche,
  Quantites,
  Realise,
  ReponseCloture,
} from './types.ts';

/*
 * Accès aux données de « Atelier › Production ». En attendant le backend, elles viennent du faux
 * serveur (`/api/v1/simulation/atelier/production/…`, voir `simulation/production.ts`). Chaque
 * action renvoie l'état complet de la production, que l'on range dans le cache de TanStack Query.
 */

const RACINE = '/api/v1/simulation/atelier/production/';
const ENTETES = { 'Content-Type': 'application/json' };

/** Le reste à produire se rafraîchit sur les postes ouverts en moins de 15 s (US-088). */
export const RAFRAICHISSEMENT_MS = 15_000;

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleProduction = (utilisateur: string | undefined) =>
  ['simulation', 'atelier', 'production', utilisateur] as const;

export const cleFiches = (utilisateur: string | undefined) =>
  ['simulation', 'atelier', 'fiches', utilisateur] as const;

async function envoyer<T>(methode: 'POST' | 'PUT', chemin: string, corps?: object): Promise<T> {
  const reponse = await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
    method: methode,
    headers: ENTETES,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return reponse.data;
}

export function useProduction(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleProduction(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneProduction>>(RACINE)).data,
    enabled: SIMULATION && Boolean(utilisateur),
    // Les commandes, le stock et les demandes bougent depuis d'autres écrans.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: RAFRAICHISSEMENT_MS,
  });
}

export type NouveauSupplement = { sacs: Quantites; motif: MotifSupplement };

type AvecInstantane = { instantane: InstantaneProduction };

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

function actionsDe(client: QueryClient, utilisateur: string | undefined) {
  const cle = cleProduction(utilisateur);
  const ranger = async <T extends AvecInstantane>(demande: Promise<T>) => {
    const reponse = await demande;
    client.setQueryData(cle, reponse.instantane);
    // Chaque étape du cycle prévient l'équipe, et un supplément devient une demande.
    void client.invalidateQueries({ queryKey: ['simulation', 'notifications'] });
    void client.invalidateQueries({ queryKey: ['simulation', 'demandes'] });
    return reponse;
  };
  return {
    proposerLePlan: () => ranger(envoyer<AvecInstantane>('POST', 'plan/proposer/')),
    validerLePlan: () => ranger(envoyer<AvecInstantane>('POST', 'plan/valider/')),
    ouvrir: () => ranger(envoyer<AvecInstantane>('POST', 'ouvrir/')),
    enregistrerLeRealise: (realise: Realise) =>
      ranger(envoyer<AvecInstantane>('PUT', 'realise/', realise)),
    enregistrerLaConsommation: (consommation: Consommation) =>
      ranger(envoyer<AvecInstantane>('PUT', 'consommation/', consommation)),
    justifier: (justification: { motif: MotifEcart; texte: string; consommation: Consommation }) =>
      ranger(envoyer<AvecInstantane>('POST', 'justification/', justification)),
    cloturer: async (valeurs: { realise: Realise; consommation: Consommation }) => {
      const reponse = await ranger(envoyer<ReponseCloture>('POST', 'cloturer/', valeurs));
      // La clôture crée les sorties de stock : l'écran Stocks les relit à l'ouverture.
      void client.invalidateQueries({ queryKey: ['simulation', 'atelier', 'stocks'] });
      return reponse;
    },
    ajouterUnSupplement: (supplement: NouveauSupplement) =>
      ranger(
        envoyer<AvecInstantane & { demande?: { id: string; numero: number } }>(
          'POST',
          'supplement/',
          supplement,
        ),
      ),
  };
}

export type ActionsProduction = ReturnType<typeof actionsDe>;

export function useActionsProduction(utilisateur: string | undefined): ActionsProduction {
  const client = useQueryClient();
  return useMemo(() => actionsDe(client, utilisateur), [client, utilisateur]);
}

export function useFiches(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleFiches(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantaneFiches>>(`${RACINE}fiches/`)).data,
    enabled: SIMULATION && Boolean(utilisateur),
    // Les prix suivent les achats en stock.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useModifierFiche(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, recette }: { id: string; recette: ModificationFiche }) =>
      (
        await optiboulFetch<Reponse<InstantaneFiches>>(`${RACINE}fiches/${id}/`, {
          method: 'PUT',
          headers: ENTETES,
          body: JSON.stringify(recette),
        })
      ).data,
    onSuccess: (fiches) => client.setQueryData(cleFiches(utilisateur), fiches),
  });
}
