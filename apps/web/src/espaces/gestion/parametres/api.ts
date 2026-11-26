import {
  ErreurApi,
  parametresUpdate,
  produitsCreate,
  produitsList,
  produitsPartialUpdate,
  toutesLesPages,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireHistoriqueReel, lireParametresReels, lireProduitsReels } from './reel.ts';
import { poserLaFiche } from '../../atelier/production/fiches.ts';
import type { Recette } from '../../atelier/production/types.ts';
import type { NouveauProduit } from './ModaleNouveauProduit.tsx';
import type { SaisieProduit } from './ModaleProduit.tsx';
import type { Parametre, ValeurParametre } from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleParametres = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'parametres', utilisateur] as const;
export const cleProduits = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'parametres', 'produits', utilisateur] as const;
export const cleHistorique = (utilisateur: string | undefined, cle: string) =>
  ['ecran', 'gestion', 'parametres', 'historique', utilisateur, cle] as const;

export function useParametres(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleParametres(utilisateur),
    queryFn: lireParametresReels,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useProduits(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleProduits(utilisateur),
    queryFn: lireProduitsReels,
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
    queryFn: () => lireHistoriqueReel(cle),
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
      (await parametresUpdate(cle, { valeur })).data as unknown as Parametre,
    onSuccess: (parametre) => {
      client.setQueryData<Parametre[]>(cleParametres(utilisateur), (liste) =>
        liste?.map((p) => (p.cle === parametre.cle ? parametre : p)),
      );
      void client.invalidateQueries({
        queryKey: cleHistorique(utilisateur, parametre.cle),
      });
      // Les autres écrans lisent ces seuils (plafond de dette, validation des dépenses…) et le
      // journal reçoit la ligne : on les relit à leur prochaine ouverture.
      void client.invalidateQueries({ queryKey: ['ecran'], refetchType: 'none' });
    },
  });
}

/**
 * La phrase d'un refus 400 du serveur : `{ valeur: "…" }` (API réelle) ou `{ detail: "…" }`. Les
 * autres erreurs (500, réseau) n'en ont pas : l'écran affiche alors son message générique.
 */
export function phraseDuServeur(erreur: unknown): string | undefined {
  if (!(erreur instanceof ErreurApi) || erreur.status !== 400) return undefined;
  const corps = (erreur.details ?? {}) as { valeur?: unknown; detail?: unknown };
  const brute = Array.isArray(corps.valeur) ? corps.valeur[0] : corps.valeur;
  const phrase = typeof brute === 'string' ? brute : corps.detail;
  return typeof phrase === 'string' && phrase.trim() ? phrase : undefined;
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

/** Modifie un produit du catalogue (propriétaire) : `PATCH /produits/{id}/`. */
export function useModifierProduit(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saisie }: { id: number; saisie: SaisieProduit }) =>
      produitsPartialUpdate(id, {
        nom: saisie.nom,
        nom_en: saisie.nomEn,
        prix: saisie.prix,
        cuisson_minutes: saisie.cuisson,
        actif: saisie.actif,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: cleProduits(utilisateur) }),
  });
}

/** Crée le produit (`POST /produits/`) : sans recette, il reste invisible du plan et des fiches. */
export function useCreerProduit(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (produit: NouveauProduit): Promise<number> => {
      // Le nouveau produit passe après les autres dans les colonnes du comptoir.
      const existants = await toutesLesPages<{ ordre?: number }>(
        (page) =>
          produitsList({ page }) as unknown as Promise<{
            data: { results?: { ordre?: number }[]; next?: string | null };
          }>,
      ).catch(() => []);
      const ordre = existants.reduce((max, p) => Math.max(max, p.ordre ?? 0), 0) + 1;
      const reponse = await produitsCreate({
        code: produit.code,
        nom: produit.nom,
        nom_en: produit.nomEn,
        prix: produit.prix,
        cuisson_minutes: produit.cuisson,
        actif: true,
        ordre,
      } as Parameters<typeof produitsCreate>[0]);
      return (reponse.data as { id: number }).id;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: cleProduits(utilisateur) }),
  });
}

/** Pose la première version de la fiche du produit : rendement et recette d'un sac. */
export function useAjouterLaRecette(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recette }: { id: number; recette: Recette }) => poserLaFiche(id, recette),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: cleProduits(utilisateur) });
      void client.invalidateQueries({ queryKey: ['ecran', 'atelier'] });
    },
  });
}
