import {
  ErreurApi,
  productionsCloturerCreate,
  productionsFourneeDestroy,
  productionsConsommationUpdate,
  productionsFourneeCreate,
  productionsOuvrirCreate,
  productionsProposerCreate,
  productionsSupplementCreate,
  productionsValiderCreate,
} from '@/api';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { lireFichesReelles, modifierFicheSurLeServeur } from './fiches.ts';
import {
  justificationEnvoyee,
  retenirJustification,
  texteDeJustification,
} from './justifications.ts';
import { CODE_SERVEUR, lireProductionReelle } from './reel.ts';
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
 * Accès aux données de « Atelier › Production » : `reel.ts` compose l'instantané à partir des routes
 * du serveur. Chaque action écrit sur le serveur, puis relit l'état complet de la production, que
 * l'on range dans le cache de TanStack Query.
 */

/** Le reste à produire se rafraîchit sur les postes ouverts en moins de 15 s (US-088). */
export const RAFRAICHISSEMENT_MS = 15_000;

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleProduction = (utilisateur: string | undefined) =>
  ['ecran', 'atelier', 'production', utilisateur] as const;

export const cleFiches = (utilisateur: string | undefined) =>
  ['ecran', 'atelier', 'fiches', utilisateur] as const;

export function useProduction(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleProduction(utilisateur),
    queryFn: lireProductionReelle,
    enabled: Boolean(utilisateur),
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

export function actionsDe(client: QueryClient, utilisateur: string | undefined) {
  const cle = cleProduction(utilisateur);
  const ranger = async <T extends AvecInstantane>(demande: Promise<T>) => {
    const reponse = await demande;
    client.setQueryData(cle, reponse.instantane);
    // Chaque étape du cycle prévient l'équipe, et un supplément devient une demande.
    void client.invalidateQueries({ queryKey: ['ecran', 'notifications'] });
    void client.invalidateQueries({ queryKey: ['ecran', 'demandes'] });
    return reponse;
  };
  /** Session visée : celle que le plan a désignée. */
  const session = () => {
    const lue = client.getQueryData<InstantaneProduction>(cle);
    return lue ? { jour: lue.session.date, creneau: lue.session.type as never } : {};
  };
  const lue = () => client.getQueryData<InstantaneProduction>(cle);
  /** Après une écriture : on relit l'instantané complet. */
  const relire = async () => ({ instantane: await lireProductionReelle() });
  const sansProduction = () =>
    Promise.reject(
      new ErreurApi(409, { code: 'production_inconnue', detail: 'Production non ouverte' }),
    );
  /** Les fournées à ajouter pour passer du réalisé du serveur au réalisé saisi (le serveur les cumule). */
  const fournees = async (id: number, realise: Realise) => {
    const avant = lue()?.realise;
    for (const produit of Object.keys(CODE_SERVEUR) as (keyof Realise)[]) {
      const voulu = realise[produit] ?? 0;
      const delta = voulu - (avant?.[produit] ?? 0);
      if (delta > 0)
        await productionsFourneeCreate(id, { produit: CODE_SERVEUR[produit], pains: delta });
    }
  };
  /** La justification déjà envoyée pour cette production, redite pour chaque matière saisie. */
  const justificationsDeLaProduction = (id: string, consommation: Consommation) => {
    const deja = justificationEnvoyee(id);
    if (!deja) return {};
    const texte = texteDeJustification(deja);
    return {
      justifications: Object.fromEntries(
        Object.keys(quantitesServeur(consommation)).map((m) => [m, texte]),
      ),
    };
  };
  const quantitesServeur = (consommation: Consommation) =>
    Object.fromEntries(
      Object.entries(consommation)
        .filter(([, valeur]) => valeur !== null)
        .map(([matiere, valeur]) => [matiere, String(valeur)]),
    );
  return {
    proposerLePlan: () => ranger(productionsProposerCreate(session()).then(relire)),
    validerLePlan: () => ranger(productionsValiderCreate(session()).then(relire)),
    ouvrir: () => ranger(productionsOuvrirCreate(session()).then(relire)),
    enregistrerLeRealise: (realise: Realise) =>
      ranger(
        (async () => {
          const id = lue()?.productionId;
          if (!id) return sansProduction();
          await fournees(Number(id), realise);
          return relire();
        })(),
      ),
    /** Annule la dernière fournée (le serveur refuse toute autre). */
    annulerLaDerniereFournee: (numero: number) =>
      ranger(
        (async () => {
          const id = lue()?.productionId;
          if (!id) return sansProduction();
          await productionsFourneeDestroy(Number(id), numero);
          return relire();
        })(),
      ),
    enregistrerLaConsommation: (consommation: Consommation) =>
      ranger(
        (async () => {
          const id = lue()?.productionId;
          if (!id) return sansProduction();
          await productionsConsommationUpdate(Number(id), {
            quantites: quantitesServeur(consommation),
            ...justificationsDeLaProduction(id, consommation),
          });
          return relire();
        })(),
      ),
    justifier: (justification: { motif: MotifEcart; texte: string; consommation: Consommation }) =>
      ranger(
        (async () => {
          const id = lue()?.productionId;
          if (!id) return sansProduction();
          const quantites = quantitesServeur(justification.consommation);
          // Le serveur garde une justification par matière (R10) : le motif et le texte, pour chacune.
          const texte = texteDeJustification(justification);
          await productionsConsommationUpdate(Number(id), {
            quantites,
            justifications: Object.fromEntries(Object.keys(quantites).map((m) => [m, texte])),
          });
          retenirJustification(id, { motif: justification.motif, texte: justification.texte });
          return relire();
        })(),
      ),
    cloturer: async (valeurs: { realise: Realise; consommation: Consommation }) => {
      const reponse = await ranger(
        (async () => {
          const id = lue()?.productionId;
          if (!id) return sansProduction();
          await fournees(Number(id), valeurs.realise);
          await productionsConsommationUpdate(Number(id), {
            quantites: quantitesServeur(valeurs.consommation),
            ...justificationsDeLaProduction(id, valeurs.consommation),
          });
          await productionsCloturerCreate(Number(id));
          const apres = await relire();
          // La clôture sort de stock ce qui a été consommé.
          const sorties = Object.entries(valeurs.consommation)
            .filter(([, v]) => v !== null && v > 0)
            .map(([matiere, quantite]) => ({ matiere, quantite: quantite as number }));
          return { ...apres, sorties } as ReponseCloture;
        })(),
      );
      // La clôture crée les sorties de stock : l'écran Stocks les relit à l'ouverture.
      void client.invalidateQueries({ queryKey: ['ecran', 'atelier', 'stocks'] });
      return reponse;
    },
    ajouterUnSupplement: (supplement: NouveauSupplement) =>
      ranger(
        (async () => {
          const reponse = await productionsSupplementCreate({
            ...session(),
            supplement: Object.fromEntries(
              (Object.keys(CODE_SERVEUR) as (keyof Quantites)[]).map((p) => [
                CODE_SERVEUR[p],
                supplement.sacs[p],
              ]),
            ),
            motif: supplement.motif as never,
          });
          const apres = await relire();
          const demande = (reponse.data as { demande?: string | null }).demande;
          return {
            ...apres,
            ...(demande
              ? { demande: { id: demande, numero: Number(demande.replace(/\D/g, '')) } }
              : {}),
          };
        })(),
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
    queryFn: lireFichesReelles,
    enabled: Boolean(utilisateur),
    // Les prix suivent les achats en stock.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useModifierFiche(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      recette,
    }: {
      id: string;
      recette: ModificationFiche;
    }): Promise<InstantaneFiches> => {
      // Une modification crée une nouvelle version de la fiche du produit.
      const lues = client.getQueryData<InstantaneFiches>(cleFiches(utilisateur));
      const fiche = lues?.fiches.find((f) => f.id === id);
      if (!fiche?.idServeur || !lues) {
        throw new ErreurApi(409, { code: 'produit_inconnu', detail: 'Produit introuvable' });
      }
      return modifierFicheSurLeServeur(fiche.idServeur, recette, lues.prix);
    },
    onSuccess: (fiches) => client.setQueryData(cleFiches(utilisateur), fiches),
  });
}
