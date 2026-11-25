import {
  controlesStockCommencerCreate,
  controlesStockValiderCreate,
  ErreurApi,
  mouvementsStockSaisirCreate,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireStocksReels } from './reel.ts';
import type {
  InstantaneStocks,
  Inventaire,
  Mouvement,
  NouveauMouvement,
  NouvelInventaire,
} from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleStocks = (utilisateur: string | undefined) =>
  ['ecran', 'atelier', 'stocks', utilisateur] as const;

export function useStocks(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleStocks(utilisateur),
    queryFn: lireStocksReels,
    enabled: Boolean(utilisateur),
    // Le stock bouge depuis d'autres écrans (dépenses, demandes) : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export type MouvementEnregistre = { instantane: InstantaneStocks; mouvement: Mouvement };

export function useEnregistrerMouvement(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (mouvement: NouveauMouvement): Promise<MouvementEnregistre> => {
      // Une perte sort du stock ; une entrée à la main est une correction positive (motif obligatoire).
      await mouvementsStockSaisirCreate(
        {
          matiere: mouvement.matiere,
          quantite: String(mouvement.quantite),
          genre: (mouvement.type === 'perte' ? 'perte' : 'correction') as never,
          sens: (mouvement.type === 'perte' ? -1 : 1) as never,
          motif: mouvement.motif,
        },
        // Le serveur exige une clé d'idempotence sur cette écriture (non déclarée dans le schéma).
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      );
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
      void client.invalidateQueries({ queryKey: ['ecran', 'demandes'] });
      // Le rappel « Contrôle de stock à faire aujourd'hui » disparaît une fois le comptage fait.
      void client.invalidateQueries({ queryKey: ['ecran', 'notifications'] });
    },
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
