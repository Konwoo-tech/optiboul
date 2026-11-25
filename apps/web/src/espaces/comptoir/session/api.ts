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
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { lireSessionReelle, versLivraison } from './reel.ts';
import type {
  CleProduit,
  InstantaneSession,
  ModePaiement,
  Quantites,
  TypeMouvement,
} from './types.ts';

/*
 * Accès aux données de « Comptoir › Session en cours » : `reel.ts` compose l'instantané à partir des
 * routes du serveur. Chaque action écrit sur le serveur, puis relit l'état complet, que l'on range
 * dans le cache de TanStack Query.
 */

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSession = (utilisateur: string | undefined) =>
  ['simulation', 'comptoir', 'session', utilisateur] as const;

export function useSessionComptoir(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSession(utilisateur),
    queryFn: lireSessionReelle,
    enabled: Boolean(utilisateur),
    // D'autres personnes saisissent aussi : on relit régulièrement.
    staleTime: 0,
    refetchInterval: () => (envois.size > 0 ? false : 15_000),
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
    },
    relancer: (clientIds: string[]) =>
      ranger(
        commandesRelancerHabituelsCreate({
          jour: session()?.date,
          creneau: session()?.type,
          clients: clientIds.map(Number),
        }).then(relire),
      ),
    reprendreHabituelle: (clientId: string) =>
      ranger(
        commandesReprendreHabituelleCreate({
          client: Number(clientId),
          jour: session()?.date,
          creneau: session()?.type,
        }).then(relire),
      ),
    livrer: (livraison: NouvelleLivraison) =>
      ranger(
        livraisonsCreate(corpsDeLivraison(livraison), {
          headers: { 'Idempotency-Key': livraison.cle ?? crypto.randomUUID() },
        }).then(async (reponse) => ({
          ...(await relire()),
          livraison: versLivraison(reponse.data as never),
        })),
      ),
    /** Paiement d'une dette sans pain livré. */
    encaisser: (paiement: NouvelEncaissement) =>
      ranger(
        encaissementsCreate(
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
    demanderAutorisation: (clientId: string, livraison?: NouvelleLivraison) =>
      ranger(
        (async () => {
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
    deciderAutorisation: (
      demandeId: string,
      code: string,
      accord: boolean,
      valideur?: 'gerant' | 'proprietaire',
    ) =>
      ranger(
        (async () => {
          const avant = client
            .getQueryData<InstantaneSession>(cle)
            ?.demandes.find((d) => d.id === demandeId);
          if (!avant) return indisponible();
          // Le valideur est désigné par son profil (#316) : le propriétaire connecté décide avec
          // son code ; sinon le gérant de la semaine ouverte, sans qu'on cherche son identifiant.
          const profil = valideur ?? (moi?.profil === 'proprietaire' ? 'proprietaire' : 'gerant');
          const code_gerant = { profil, code } as const;
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
        mouvementsInternesCreate({
          genre: GENRE_DU_TYPE[mouvement.type] as never,
          produit: mouvement.produit === 'GC' ? 'GC135' : mouvement.produit,
          quantite: mouvement.quantite,
          motif: mouvement.motif,
        }).then(relire),
      ),
    /** Ferme la caisse de la session avec le comptage saisi dans l'onglet Clôture. */
    cloturer: () =>
      ranger(
        (async () => {
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
        (async () => {
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
        (async () => {
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
  const idConnecte = String(connecte?.id ?? '');
  const profil = connecte?.profil;
  // Référence stable : les écouteurs clavier ne se réinstallent pas à chaque rendu.
  return useMemo(
    () => actionsSession(client, utilisateur, { id: idConnecte, profil }),
    [client, utilisateur, idConnecte, profil],
  );
}

/** Envoie le bon par WhatsApp (file d'envoi). */
export async function envoyerBonParWhatsapp(idLivraison: string): Promise<void> {
  await livraisonsEnvoyerWhatsappCreate(Number(idLivraison));
}

/** Ouvre le bon en PDF dans un nouvel onglet : le navigateur porte la session. */
export function ouvrirBonPdf(idLivraison: string) {
  window.open(getLivraisonsBonRetrieveUrl(Number(idLivraison)), '_blank', 'noopener');
}
