import {
  controlesStockCommencerCreate,
  controlesStockValiderCreate,
  ErreurApi,
  mouvementsStockSaisirCreate,
  optiboulFetch,
} from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireStocksReels } from './reel.ts';
import type {
  InstantaneStocks,
  Inventaire,
  Mouvement,
  NouveauMouvement,
  NouvelInventaire,
} from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/stocks.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = '/api/v1/simulation/atelier/stocks/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleStocks = (utilisateur: string | undefined) =>
  ['simulation', 'atelier', 'stocks', utilisateur] as const;

export function useStocks(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleStocks(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantaneStocks>>(RACINE)).data
        : lireStocksReels(),
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
    mutationFn: async (mouvement: NouveauMouvement): Promise<MouvementEnregistre> => {
      if (SIMULATION) return publier<MouvementEnregistre>('mouvements/', mouvement);
      // Une perte sort du stock ; une entrée à la main est une correction positive (motif obligatoire).
      await mouvementsStockSaisirCreate({
        matiere: mouvement.matiere,
        quantite: String(mouvement.quantite),
        genre: (mouvement.type === 'perte' ? 'perte' : 'correction') as never,
        sens: (mouvement.type === 'perte' ? -1 : 1) as never,
        motif: mouvement.motif,
      });
      const instantane = await lireStocksReels();
      return { instantane, mouvement: instantane.mouvements[0] as Mouvement };
    },
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
    mutationFn: async (inventaire: NouvelInventaire): Promise<InventaireEnregistre> => {
      if (SIMULATION) return publier<InventaireEnregistre>('inventaires/', inventaire);
      // Le contrôle du jour : on le commence (liste à compter), puis on valide les quantités comptées.
      const avant = client.getQueryData<InstantaneStocks>(cleStocks(utilisateur));
      const id = avant?.controleDuJourId;
      if (!id) {
        throw new ErreurApi(409, { code: 'aucun_controle', detail: 'Aucun contrôle à faire' });
      }
      await controlesStockCommencerCreate(Number(id));
      const comptes = Object.fromEntries(
        Object.entries(inventaire.comptages).map(([matiere, valeur]) => [matiere, String(valeur)]),
      );
      const reponse = await controlesStockValiderCreate(Number(id), { comptes });
      const instantane = await lireStocksReels();
      const fait = instantane.inventaires.find((i) => i.id === id) as Inventaire;
      const demande = (reponse.data as { demande?: string | null }).demande;
      return {
        instantane,
        inventaire: fait,
        ...(demande ? { demande: { numero: Number(demande.replace(/\D/g, '')) } } : {}),
      };
    },
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
