import {
  commandesCreate,
  commandesRelancerHabituelsCreate,
  commandesReprendreHabituelleCreate,
  ErreurApi,
  optiboulFetch,
} from '@/api';
import { SIMULATION } from '@/simulation';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { lireSessionReelle } from './reel.ts';
import type {
  CleProduit,
  DemandePlafond,
  InstantaneSession,
  Livraison,
  ModePaiement,
  Quantites,
  TypeMouvement,
} from './types.ts';

/*
 * Accès aux données de « Comptoir › Session en cours ». En simulation, elles viennent du faux serveur
 * (`/api/v1/simulation/comptoir/session/…`, voir `simulation/comptoir.ts`) ; sur le vrai serveur,
 * `reel.ts` compose l'instantané. Chaque action renvoie l'état complet de la session, que l'on range
 * dans le cache de TanStack Query.
 */

/**
 * Ce que l'écran peut écrire sur le vrai serveur, zone par zone : les commandes (#272) ; les
 * livraisons (#273), les mouvements et la clôture (#274) sont encore en lecture seule. En
 * simulation, tout s'écrit.
 */
export const ECRITURES = {
  commandes: true,
  livraisons: SIMULATION,
  mouvements: SIMULATION,
  cloture: SIMULATION,
} as const;

const RACINE = '/api/v1/simulation/comptoir/session/';
const ENTETES = { 'Content-Type': 'application/json' };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSession = (utilisateur: string | undefined) =>
  ['simulation', 'comptoir', 'session', utilisateur] as const;

type Reponse<T> = { data: T };

async function lire(): Promise<InstantaneSession> {
  if (!SIMULATION) return lireSessionReelle();
  return (await optiboulFetch<Reponse<InstantaneSession>>(RACINE)).data;
}

async function envoyer<T extends { instantane: InstantaneSession }>(
  methode: 'POST' | 'PUT',
  chemin: string,
  corps?: object,
): Promise<T> {
  const reponse = await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
    method: methode,
    headers: ENTETES,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return reponse.data;
}

export function useSessionComptoir(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSession(utilisateur),
    queryFn: lire,
    enabled: Boolean(utilisateur),
    // En simulation, chaque action renvoie l'état complet ; sur le vrai serveur, d'autres personnes
    // saisissent aussi : on relit régulièrement.
    staleTime: SIMULATION ? Infinity : 0,
    refetchInterval: SIMULATION ? false : () => (envois.size > 0 ? false : 15_000),
  });
}

export type NouvelleLivraison = {
  clientId: string;
  quantites: Quantites;
  mode: ModePaiement;
  recu: number;
  reference: string;
};

export type NouveauMouvement = {
  type: TypeMouvement;
  produit: CleProduit;
  quantite: number;
  motif: string;
};

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

/** Un champ de commande : la quantité saisie, ou rien. */
const entier = (valeur: string | undefined) => Number.parseInt(valeur ?? '', 10) || 0;

/** Les trois produits de l'écran, avec les codes du serveur (`GC` est `GC135`, voir E17). */
const lignesDeSaisie = (saisies: Record<CleProduit, string>) => ({
  BAG: entier(saisies.BAG),
  KO: entier(saisies.KO),
  GC135: entier(saisies.GC),
});

/** Envoi différé de la saisie d'une commande : un envoi par client, quand la frappe s'arrête. */
const DELAI_SAISIE_MS = 600;
const envois = new Map<string, ReturnType<typeof setTimeout>>();

const indisponible = () =>
  Promise.reject(new Error("Cette action n'est pas encore branchée sur le serveur"));

/** Actions de l'écran. Chacune met à jour le cache avec l'état renvoyé par le serveur. */
export function actionsSession(client: QueryClient, utilisateur: string | undefined) {
  const cle = cleSession(utilisateur);
  const ranger = async <T extends { instantane: InstantaneSession }>(demande: Promise<T>) => {
    const reponse = await demande;
    client.setQueryData(cle, reponse.instantane);
    // Les notifications suivent la session (commandes manquantes) : on les relit.
    void client.invalidateQueries({ queryKey: ['simulation', 'notifications'] });
    void client.invalidateQueries({ queryKey: ['coque', 'notifications'] });
    return reponse;
  };
  /** Après une écriture sur le vrai serveur : on relit l'instantané complet. */
  const relire = async () => ({ instantane: await lireSessionReelle() });
  const session = () => client.getQueryData<InstantaneSession>(cle)?.session;
  return {
    /**
     * Saisie d'une commande : le champ réagit tout de suite (mise à jour du cache) et le serveur
     * suit ; en cas d'échec, on recharge l'état du serveur.
     */
    saisirCommande(clientId: string, produit: CleProduit, valeur: string) {
      client.setQueryData<InstantaneSession>(cle, (avant) =>
        avant
          ? {
              ...avant,
              commandes: {
                ...avant.commandes,
                [clientId]: { ...avant.commandes[clientId]!, [produit]: valeur },
              },
            }
          : avant,
      );
      if (SIMULATION) {
        void envoyer('PUT', 'commandes/', { clientId, produit, valeur }).catch(() =>
          client.invalidateQueries({ queryKey: cle }),
        );
        return;
      }
      const cleEnvoi = `${utilisateur}/${clientId}`;
      clearTimeout(envois.get(cleEnvoi));
      envois.set(
        cleEnvoi,
        setTimeout(() => {
          envois.delete(cleEnvoi);
          const lue = client.getQueryData<InstantaneSession>(cle);
          const saisies = lue?.commandes[clientId];
          if (!lue || !saisies) return;
          void commandesCreate({
            client: Number(clientId),
            jour: lue.session.date,
            creneau: lue.session.type,
            lignes: lignesDeSaisie(saisies),
          })
            .then(() => client.invalidateQueries({ queryKey: cle }))
            .catch(() => client.invalidateQueries({ queryKey: cle }));
        }, DELAI_SAISIE_MS),
      );
    },
    saisirComptage(especes: string) {
      client.setQueryData<InstantaneSession>(cle, (avant) =>
        avant ? { ...avant, session: { ...avant.session, especesComptees: especes } } : avant,
      );
      // Le comptage n'est qu'un brouillon de l'écran : le serveur le reçoit à la fermeture.
      if (!SIMULATION) return;
      void envoyer('PUT', 'comptage/', { especes }).catch(() =>
        client.invalidateQueries({ queryKey: cle }),
      );
    },
    relancer: (clientIds: string[]) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'relances/', { clientIds })
          : commandesRelancerHabituelsCreate({
              jour: session()?.date,
              creneau: session()?.type,
              clients: clientIds.map(Number),
            }).then(relire),
      ),
    reprendreHabituelle: (clientId: string) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'commandes/habituelle/', {
              clientId,
            })
          : commandesReprendreHabituelleCreate({
              client: Number(clientId),
              jour: session()?.date,
              creneau: session()?.type,
            }).then(relire),
      ),
    livrer: (livraison: NouvelleLivraison) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession; livraison: Livraison }>(
              'POST',
              'livraisons/',
              livraison,
            )
          : indisponible(),
      ),
    demanderAutorisation: (clientId: string, soldeApres: number) =>
      ranger(
        SIMULATION
          ? envoyer<{
              instantane: InstantaneSession;
              autorise?: boolean;
              demande?: DemandePlafond;
            }>('POST', 'autorisations/', { clientId, soldeApres })
          : indisponible(),
      ),
    deciderAutorisation: (demandeId: string, code: string, accord: boolean) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession; demande: DemandePlafond }>(
              'POST',
              'autorisations/decider/',
              { demandeId, code, accord },
            )
          : indisponible(),
      ),
    ajouterMouvement: (mouvement: NouveauMouvement) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'mouvements/', mouvement)
          : indisponible(),
      ),
    cloturer: () =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'cloturer/')
          : indisponible(),
      ),
    rouvrir: () =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'rouvrir/')
          : indisponible(),
      ),
    ouvrirSuivante: () =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'ouvrir-suivante/')
          : indisponible(),
      ),
  };
}

export type ActionsSession = ReturnType<typeof actionsSession>;

export function useActionsSession(utilisateur: string | undefined): ActionsSession {
  const client = useQueryClient();
  // Référence stable : les écouteurs clavier ne se réinstallent pas à chaque rendu.
  return useMemo(() => actionsSession(client, utilisateur), [client, utilisateur]);
}
