import {
  ErreurApi,
  sauvegardesLancerCreate,
  sauvegardesRestaurerCreate,
  sauvegardesRetrieve,
  type RestaurationFaite,
  type Sauvegarde,
  type SauvegardeLancee,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireSauvegardesReelles, versCopie } from './reel.ts';
import type { InstantaneSauvegardes, ReponseCopie, ReponseRestauration } from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSauvegardes = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'sauvegardes', utilisateur] as const;

export function useSauvegardes(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSauvegardes(utilisateur),
    queryFn: lireSauvegardesReelles,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action : l'écran prend l'instantané renvoyé, et le journal (qui a une ligne de plus) est relu. */
function useAction<Demande, Resultat extends { instantane: InstantaneSauvegardes }>(
  utilisateur: string | undefined,
  action: (demande: Demande) => Promise<Resultat>,
  /** Une restauration remplace la base : tout ce que les écrans ont en cache est à relire. */
  toutRelire = false,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (resultat) => {
      client.setQueryData(cleSauvegardes(utilisateur), resultat.instantane);
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'journal'] });
      if (toutRelire) void client.invalidateQueries();
    },
  });
}

/** Relectures d'une copie lancée, à une seconde d'intervalle, avant d'annoncer qu'elle est en attente. */
const ESSAIS_DE_SUIVI = 10;

/**
 * « Lancer » met la copie en file (202) et renvoie son identifiant : on la suit
 * (`sauvegardes/{id}/`) jusqu'à sa réussite ou son échec ; trop longue, elle est annoncée « en attente ».
 */
async function lancerEtAttendre(genre: 'locale' | 'cloud'): Promise<ReponseCopie> {
  const lancee = (await sauvegardesLancerCreate({ genre })).data as unknown as SauvegardeLancee;
  for (let essai = 0; essai < ESSAIS_DE_SUIVI; essai += 1) {
    await new Promise((resoudre) => setTimeout(resoudre, 1000));
    const copie = (await sauvegardesRetrieve(lancee.id)).data as unknown as Sauvegarde;
    if (copie.statut === 'echec') {
      throw new ErreurApi(409, { code: 'sauvegarde_echec', detail: copie.erreur });
    }
    if (copie.statut === 'reussie') {
      return { copie: versCopie(copie), instantane: await lireSauvegardesReelles() };
    }
  }
  return {
    copie: { id: 'en-attente', genre, declencheur: 'manuelle', instant: new Date().toISOString() },
    instantane: await lireSauvegardesReelles(),
  };
}

export const useSauvegarderLocale = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () => lancerEtAttendre('locale'));

export const useSauvegarderCloud = (utilisateur: string | undefined) =>
  useAction<void, ReponseCopie>(utilisateur, () => lancerEtAttendre('cloud'));

/**
 * Restaure une copie. La réponse n'arrive qu'une fois la base remplacée : copie de
 * sûreté et contrôle des totaux (sessions, soldes clients, stocks). Une même clé d'idempotence rejoue
 * la réponse si la connexion tombe.
 */
async function restaurerLaCopie(id: string): Promise<ReponseRestauration> {
  const avant = await lireSauvegardesReelles();
  const faite = (
    await sauvegardesRestaurerCreate(
      Number(id),
      { confirmation: 'RESTAURER' },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    ).catch((erreur: unknown) => {
      // La base remplacée emporte la session de l'administrateur : le serveur peut alors répondre par
      // une erreur sans code alors que la restauration a eu lieu (ticket #383).
      if (erreur instanceof ErreurApi && !erreur.code && erreur.status < 500) {
        throw new ErreurApi(409, {
          code: 'restauration_session_perdue',
          detail: erreur.message,
        });
      }
      throw erreur;
    })
  ).data as unknown as RestaurationFaite;
  const instantane = await lireSauvegardesReelles();
  const copie = avant.copies.find((c) => c.id === id) ?? {
    id,
    genre: 'locale' as const,
    declencheur: 'manuelle' as const,
    instant: '',
  };
  return {
    restauration: {
      copie,
      copieAvant: versCopie(faite.copie_avant),
      controles: faite.controles.map(({ cle, ok }) => ({ cle, ok })),
    },
    instantane,
  };
}

export const useRestaurer = (utilisateur: string | undefined) =>
  useAction<string, ReponseRestauration>(utilisateur, restaurerLaCopie, true);

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
