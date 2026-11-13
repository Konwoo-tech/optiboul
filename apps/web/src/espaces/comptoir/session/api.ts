import {
  commandesCreate,
  encaissementsCreate,
  demandesAccorderCreate,
  demandesRefuserCreate,
  getLivraisonsBonRetrieveUrl,
  livraisonsCreate,
  livraisonsEnvoyerWhatsappCreate,
  caissesFermerCreate,
  caissesOuvrirCreate,
  caissesProchaineRetrieve,
  caissesRouvrirCreate,
  mouvementsInternesCreate,
  commandesRelancerHabituelsCreate,
  commandesReprendreHabituelleCreate,
  ErreurApi,
  optiboulFetch,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { SIMULATION } from '@/simulation';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { lireSessionReelle, versLivraison } from './reel.ts';
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
  livraisons: true,
  mouvements: true,
  cloture: true,
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
  /** Clé d'idempotence de l'envoi (vrai serveur) : la même tant que la saisie ne change pas. */
  cle?: string;
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

/** Genre de mouvement du serveur pour chaque type de l'écran. */
const GENRE_DU_TYPE: Record<TypeMouvement, string> = {
  'vente-guichet': 'vente_guichet',
  retours: 'retours',
  'reste-en-salle': 'reste_en_salle',
  ration: 'ration',
};

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

export type NouvelEncaissement = Pick<
  NouvelleLivraison,
  'clientId' | 'mode' | 'recu' | 'reference' | 'cle'
>;

/** Motif de la demande d'accord envoyée au gérant (le serveur l'exige). */
const MOTIF_DEPASSEMENT = 'Dépassement du plafond de dette du client';

/** Corps de `POST /livraisons/` : pains par code serveur, paiement seulement s'il y a un montant reçu. */
function corpsDeLivraison(livraison: NouvelleLivraison) {
  return {
    client: Number(livraison.clientId),
    lignes: lignesDeSaisie({
      BAG: String(livraison.quantites.BAG),
      KO: String(livraison.quantites.KO),
      GC: String(livraison.quantites.GC),
    }),
    paiement:
      livraison.recu > 0
        ? { mode: livraison.mode, montant: livraison.recu, reference: livraison.reference }
        : null,
  };
}

/** Personne connectée, pour décider d'une demande : son identifiant et son profil. */
export type PersonneConnectee = { id: string; profil: string | null | undefined };

/** Gérant de la semaine ouverte : celui dont le code valide une demande sur le poste de la caissière. */
async function gerantDeLaSemaine(): Promise<number | undefined> {
  const reponse = await optiboulFetch<{ data: { results?: { gerant?: { id: number } | null }[] } }>(
    '/api/v1/semaines/?statut=ouverte',
  ).catch(() => null);
  return reponse?.data.results?.[0]?.gerant?.id;
}

/** Actions de l'écran. Chacune met à jour le cache avec l'état renvoyé par le serveur. */
export function actionsSession(
  client: QueryClient,
  utilisateur: string | undefined,
  moi?: PersonneConnectee,
) {
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
  /** Une caisse ouverte ou fermée change la pastille de la coque et l'écran Caisses. */
  const invaliderCaisses = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] }),
      client.invalidateQueries({ queryKey: ['coque', 'contexte'] }),
    ]);
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
          : livraisonsCreate(corpsDeLivraison(livraison), {
              headers: { 'Idempotency-Key': livraison.cle ?? crypto.randomUUID() },
            }).then(async (reponse) => ({
              ...(await relire()),
              livraison: versLivraison(reponse.data as never),
            })),
      ),
    /** Paiement d'une dette sans pain livré (vrai serveur seulement : le prototype n'en a pas). */
    encaisser: (paiement: NouvelEncaissement) =>
      ranger(
        SIMULATION
          ? indisponible()
          : encaissementsCreate(
              {
                client: Number(paiement.clientId),
                mode: paiement.mode,
                montant: paiement.recu,
                reference: paiement.reference,
              },
              { headers: { 'Idempotency-Key': paiement.cle ?? crypto.randomUUID() } },
            ).then(relire),
      ),
    /**
     * Au-delà du plafond, la livraison part « en attente » avec une demande d'accord (R6) : elle se
     * fait quand le gérant accorde. Sur le vrai serveur, la demande porte donc la livraison entière.
     */
    demanderAutorisation: (clientId: string, soldeApres: number, livraison?: NouvelleLivraison) =>
      ranger(
        SIMULATION
          ? envoyer<{
              instantane: InstantaneSession;
              autorise?: boolean;
              demande?: DemandePlafond;
            }>('POST', 'autorisations/', { clientId, soldeApres })
          : (async () => {
              if (!livraison) return indisponible();
              const reponse = await livraisonsCreate(
                { ...corpsDeLivraison(livraison), demander_autorisation: MOTIF_DEPASSEMENT },
                { headers: { 'Idempotency-Key': livraison.cle ?? crypto.randomUUID() } },
              );
              const lue = await relire();
              // 201 : livrée d'emblée ; 202 : en attente de l'accord d'un valideur.
              const livree = reponse.status === 201;
              const direction = moi?.profil === 'gerant' || moi?.profil === 'proprietaire';
              // Le serveur refuse qu'on valide sa propre demande : celle d'un gérant attend le propriétaire,
              // sans fenêtre de code à ouvrir sur ce poste (voir E29).
              const demande =
                livree || direction
                  ? undefined
                  : lue.instantane.demandes.find((d) => d.clientId === clientId);
              return { ...lue, autorise: livree, demande };
            })(),
      ),
    /**
     * Le gérant (ou le propriétaire) décide sur le poste de la caissière avec son code. Connecté en
     * gérant ou propriétaire, c'est sa propre personne ; sinon, le gérant de la semaine.
     */
    deciderAutorisation: (demandeId: string, code: string, accord: boolean) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession; demande: DemandePlafond }>(
              'POST',
              'autorisations/decider/',
              { demandeId, code, accord },
            )
          : (async () => {
              const avant = client
                .getQueryData<InstantaneSession>(cle)
                ?.demandes.find((d) => d.id === demandeId);
              const direction = moi?.profil === 'gerant' || moi?.profil === 'proprietaire';
              const decideur = direction ? Number(moi?.id) : await gerantDeLaSemaine();
              if (!avant || !decideur) return indisponible();
              const code_gerant = { utilisateur: decideur, code };
              await (accord
                ? demandesAccorderCreate(Number(demandeId), { code_gerant })
                : demandesRefuserCreate(Number(demandeId), {
                    code_gerant,
                    motif: 'Refusé au comptoir',
                  }));
              const lue = await relire();
              return {
                ...lue,
                demande: {
                  ...avant,
                  statut: accord ? ('acceptee' as const) : ('refusee' as const),
                },
              };
            })(),
      ),
    ajouterMouvement: (mouvement: NouveauMouvement) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'mouvements/', mouvement)
          : mouvementsInternesCreate({
              genre: GENRE_DU_TYPE[mouvement.type] as never,
              produit: mouvement.produit === 'GC' ? 'GC135' : mouvement.produit,
              quantite: mouvement.quantite,
              motif: mouvement.motif,
            }).then(relire),
      ),
    /** Ferme la caisse de la session avec le comptage saisi dans l'onglet Clôture. */
    cloturer: () =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'cloturer/')
          : (async () => {
              const lue = session();
              const compte = Number.parseInt(lue?.especesComptees ?? '', 10);
              if (!lue?.caisseId) return indisponible();
              if (Number.isNaN(compte))
                throw new ErreurApi(409, { code: 'comptage_requis', detail: 'Comptage requis' });
              await caissesFermerCreate(Number(lue.caisseId), { compte });
              await invaliderCaisses();
              return relire();
            })(),
      ),
    /** Rouvre la caisse fermée ; le serveur exige un motif (gérant ou propriétaire). */
    rouvrir: (motif?: string) =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'rouvrir/')
          : (async () => {
              const lue = session();
              if (!lue?.caisseId) return indisponible();
              await caissesRouvrirCreate(Number(lue.caisseId), { motif: motif ?? '' });
              await invaliderCaisses();
              return relire();
            })(),
      ),
    /** Ouvre la caisse suivante avec le fonds que le serveur propose. */
    ouvrirSuivante: () =>
      ranger(
        SIMULATION
          ? envoyer<{ instantane: InstantaneSession }>('POST', 'ouvrir-suivante/')
          : (async () => {
              const prochaine = await caissesProchaineRetrieve();
              await caissesOuvrirCreate({ fonds: prochaine.data.fonds_propose });
              await invaliderCaisses();
              return relire();
            })(),
      ),
  };
}

export type ActionsSession = ReturnType<typeof actionsSession>;

export function useActionsSession(utilisateur: string | undefined): ActionsSession {
  const client = useQueryClient();
  const { utilisateur: connecte } = useUtilisateurCourant();
  const idConnecte = connecte?.url?.split('/').filter(Boolean).at(-1) ?? '';
  const profil = connecte?.profil;
  // Référence stable : les écouteurs clavier ne se réinstallent pas à chaque rendu.
  return useMemo(
    () => actionsSession(client, utilisateur, { id: idConnecte, profil }),
    [client, utilisateur, idConnecte, profil],
  );
}

/** Envoie le bon par WhatsApp (file d'envoi) ; en simulation, rien ne part. */
export async function envoyerBonParWhatsapp(idLivraison: string): Promise<void> {
  if (!SIMULATION) await livraisonsEnvoyerWhatsappCreate(Number(idLivraison));
}

/** Ouvre le bon en PDF dans un nouvel onglet : le navigateur porte la session. */
export function ouvrirBonPdf(idLivraison: string) {
  if (SIMULATION) return;
  window.open(getLivraisonsBonRetrieveUrl(Number(idLivraison)), '_blank', 'noopener');
}
