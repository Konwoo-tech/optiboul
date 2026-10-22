import { ErreurApi, optiboulFetch } from '@/api';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

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
 * Accès aux données de « Comptoir › Session en cours ». En attendant le backend, elles viennent du
 * faux serveur (`/api/v1/simulation/comptoir/session/…`, voir `simulation/comptoir.ts`). Chaque
 * action renvoie l'état complet de la session, que l'on range dans le cache de TanStack Query.
 */

const RACINE = '/api/v1/simulation/comptoir/session/';
const ENTETES = { 'Content-Type': 'application/json' };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSession = (utilisateur: string | undefined) =>
  ['simulation', 'comptoir', 'session', utilisateur] as const;

type Reponse<T> = { data: T };

async function lire(): Promise<InstantaneSession> {
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
    staleTime: Infinity,
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

/** Actions de l'écran. Chacune met à jour le cache avec l'état renvoyé par le serveur. */
export function actionsSession(client: QueryClient, utilisateur: string | undefined) {
  const cle = cleSession(utilisateur);
  const ranger = async <T extends { instantane: InstantaneSession }>(demande: Promise<T>) => {
    const reponse = await demande;
    client.setQueryData(cle, reponse.instantane);
    return reponse;
  };
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
      void envoyer('PUT', 'commandes/', { clientId, produit, valeur }).catch(() =>
        client.invalidateQueries({ queryKey: cle }),
      );
    },
    saisirComptage(especes: string) {
      client.setQueryData<InstantaneSession>(cle, (avant) =>
        avant ? { ...avant, session: { ...avant.session, especesComptees: especes } } : avant,
      );
      void envoyer('PUT', 'comptage/', { especes }).catch(() =>
        client.invalidateQueries({ queryKey: cle }),
      );
    },
    relancer: (clientIds: string[]) =>
      ranger(envoyer<{ instantane: InstantaneSession }>('POST', 'relances/', { clientIds })),
    reprendreHabituelle: (clientId: string) =>
      ranger(
        envoyer<{ instantane: InstantaneSession }>('POST', 'commandes/habituelle/', { clientId }),
      ),
    livrer: (livraison: NouvelleLivraison) =>
      ranger(
        envoyer<{ instantane: InstantaneSession; livraison: Livraison }>(
          'POST',
          'livraisons/',
          livraison,
        ),
      ),
    demanderAutorisation: (clientId: string, soldeApres: number) =>
      ranger(
        envoyer<{
          instantane: InstantaneSession;
          autorise?: boolean;
          demande?: DemandePlafond;
        }>('POST', 'autorisations/', { clientId, soldeApres }),
      ),
    deciderAutorisation: (demandeId: string, code: string, accord: boolean) =>
      ranger(
        envoyer<{ instantane: InstantaneSession; demande: DemandePlafond }>(
          'POST',
          'autorisations/decider/',
          { demandeId, code, accord },
        ),
      ),
    ajouterMouvement: (mouvement: NouveauMouvement) =>
      ranger(envoyer<{ instantane: InstantaneSession }>('POST', 'mouvements/', mouvement)),
    cloturer: () => ranger(envoyer<{ instantane: InstantaneSession }>('POST', 'cloturer/')),
    rouvrir: () => ranger(envoyer<{ instantane: InstantaneSession }>('POST', 'rouvrir/')),
    ouvrirSuivante: () =>
      ranger(envoyer<{ instantane: InstantaneSession }>('POST', 'ouvrir-suivante/')),
  };
}

export type ActionsSession = ReturnType<typeof actionsSession>;

export function useActionsSession(utilisateur: string | undefined): ActionsSession {
  const client = useQueryClient();
  // Référence stable : les écouteurs clavier ne se réinstallent pas à chaque rendu.
  return useMemo(() => actionsSession(client, utilisateur), [client, utilisateur]);
}
