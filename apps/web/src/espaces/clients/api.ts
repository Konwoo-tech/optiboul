import {
  clientsCreate,
  clientsPartialUpdate,
  clientsDettesRetrieve,
  clientsEnvoyerReleveCreate,
  clientsList,
  clientsRelancerCreate,
  clientsRelancerGroupeCreate,
  getClientsRelevePdfRetrieveUrl,
  toutesLesPages,
  livraisonsList,
  type Client,
  type Livraison,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useContexte } from '@/coque/contexte.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ClientDeLecran, ListeClients, LigneHistoriqueClient } from './types.ts';

const FUSEAU = 'Africa/Douala';
/** Plafond de dette par défaut (R6) si le serveur ne dit rien : paramètre `plafond_dette_client`. */
const PLAFOND_PAR_DEFAUT = 2000;

type Page<T> = { data: { results?: T[]; next?: string | null } };

const jourDeYaounde = (instant: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(instant); // AAAA-MM-JJ

/** Dimanche de la semaine en cours (date limite de règlement), `AAAA-MM-JJ`. */
export function dimancheDeLaSemaine(maintenant = new Date()): string {
  const [annee, mois, jour] = jourDeYaounde(maintenant).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}

/** Un client du vrai serveur, tel que l'écran le lit. */
export function versClientDeLecran(client: Client, relances: ReadonlySet<number>): ClientDeLecran {
  const prix = (client.prix ?? {}) as Record<string, number | null>;
  return {
    id: String(client.id),
    nom: client.nom,
    type: client.type ?? 'livreur',
    lieu: client.lieu ?? '',
    // Le serveur masque le téléphone pour la caissière : on l'affiche tel quel.
    telephone: client.telephone ?? '',
    tarifs: { BAG: prix.BAG ?? 0, KO: prix.KO ?? 0, GC: prix.GC135 ?? 0 },
    solde: client.solde,
    relance: relances.has(client.id),
    plafond: client.plafond_effectif,
    plafondPropre: client.plafond ?? null,
    tarifsPropres: (client.tarifs ?? {}) as Record<string, number>,
    actif: client.actif ?? true,
  };
}

/** Plafond le plus courant parmi les clients : celui qu'affiche « au-delà de … » dans les chiffres. */
export function plafondCourant(clients: readonly ClientDeLecran[]): number {
  const nombres = new Map<number, number>();
  for (const client of clients) {
    if (client.plafond !== undefined)
      nombres.set(client.plafond, (nombres.get(client.plafond) ?? 0) + 1);
  }
  const [courant] = [...nombres].sort((a, b) => b[1] - a[1])[0] ?? [];
  return courant ?? PLAFOND_PAR_DEFAUT;
}

async function lireClients(): Promise<Omit<ListeClients, 'echeance'>> {
  const [clients, dettes] = await Promise.all([
    toutesLesPages<Client>((page) => clientsList({ actif: true, page }) as Promise<Page<Client>>),
    clientsDettesRetrieve().catch(() => null),
  ]);
  const relances = new Set(
    (
      (dettes?.data as { clients?: { id: number; derniere_relance: unknown }[] } | undefined)
        ?.clients ?? []
    )
      .filter((dette) => dette.derniere_relance)
      .map((dette) => dette.id),
  );
  const lus = clients.map((client) => versClientDeLecran(client, relances));
  return { plafond: plafondCourant(lus), clients: lus };
}

/**
 * Clients, soldes et plafond de dette. Sur le vrai serveur : `GET /clients/` (toutes les pages) et
 * `GET /clients/dettes/` (dernière relance). La date limite de
 * règlement est le dimanche de la semaine ouverte.
 */
export function useClients(): {
  data: ListeClients | undefined;
  isPending: boolean;
  isError: boolean;
} {
  const { utilisateur } = useUtilisateurCourant();
  const { data: contexte } = useContexte();
  const reels = useQuery({
    queryKey: ['clients', 'liste', utilisateur?.url],
    queryFn: lireClients,
    enabled: Boolean(utilisateur),
  });
  const echeance = contexte?.semaine.au ?? dimancheDeLaSemaine();
  const data = useMemo(
    () => (reels.data ? { ...reels.data, echeance } : undefined),
    [reels.data, echeance],
  );
  return { data, isPending: reels.isPending, isError: reels.isError };
}

/** « 21:41 » si la livraison date d'aujourd'hui, sinon le créneau de la session (« nuit », « jour »). */
export function momentDeLivraison(
  livraison: Pick<Livraison, 'cree_le' | 'creneau'>,
  maintenant = new Date(),
) {
  const creee = new Date(livraison.cree_le);
  if (jourDeYaounde(creee) !== jourDeYaounde(maintenant)) return livraison.creneau;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  }).format(creee);
}

async function lireHistorique(id: string): Promise<LigneHistoriqueClient[]> {
  const livraisons = await toutesLesPages<Livraison>(
    (page) => livraisonsList({ client: Number(id), page }) as Promise<Page<Livraison>>,
  );
  return livraisons
    .filter((livraison) => livraison.statut === 'livree')
    .map((livraison) => ({
      bon: livraison.numero,
      date: livraison.jour,
      moment: momentDeLivraison(livraison),
      du: livraison.montant_du,
      recu: livraison.recu,
    }))
    .sort((a, b) => b.bon - a.bon);
}

/** Livraisons d'un client, de la plus récente à la plus ancienne. */
export function useHistoriqueClient(id: string | null) {
  return useQuery({
    queryKey: ['clients', 'historique', id],
    queryFn: () => lireHistorique(id as string),
    enabled: id !== null,
  });
}

/** Résultat d'une relance : messages mis en file, clients ignorés (sans téléphone ou sans dette). */
export type ResultatRelances = { relances: number; ignores: number };

/**
 * Relance WhatsApp d'un ou de plusieurs clients (gérant, propriétaire). Sur le vrai serveur, le
 * message part par la file d'envoi : un client sans numéro ou sans dette est ignoré, pas relancé.
 */
export function useRelancerClients() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<ResultatRelances> => {
      const nombres = ids.map(Number);
      const reponse =
        nombres.length === 1
          ? await clientsRelancerCreate(nombres[0] as number)
          : await clientsRelancerGroupeCreate({ clients: nombres });
      const corps = reponse.data as { relances?: unknown[]; ignores?: unknown[] };
      return { relances: corps.relances?.length ?? 0, ignores: corps.ignores?.length ?? 0 };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['clients', 'liste'] }),
  });
}

/** Envoie le relevé du client par WhatsApp (file d'envoi) ; le serveur répond 409 sans numéro. */
export function useEnvoyerReleve() {
  return useMutation({
    mutationFn: (id: string) => clientsEnvoyerReleveCreate(Number(id), {}),
  });
}

/** Ouvre le relevé PDF (30 derniers jours) dans un nouvel onglet : le navigateur porte la session. */
export function ouvrirRelevePdf(id: string) {
  window.open(getClientsRelevePdfRetrieveUrl(Number(id)), '_blank', 'noopener');
}

/** Les champs envoyés à la création ou à la modification d'un client. */
type CorpsClient = {
  nom: string;
  type: string;
  lieu: string;
  telephone: string;
  plafond?: number | null;
  tarifs: Record<string, number | null>;
  actif?: boolean;
};

/** Crée un client (gérant, propriétaire) : `POST /clients/`, prix propres compris. */
export function useCreerClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (nouveau: CorpsClient) =>
      clientsCreate(nouveau as Parameters<typeof clientsCreate>[0]),
    onSuccess: () => client.invalidateQueries({ queryKey: ['clients', 'liste'] }),
  });
}

/** Modifie un client : `PATCH /clients/{id}/` ; un prix `null` retire le prix propre. */
export function useModifierClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, corps }: { id: string; corps: CorpsClient }) =>
      clientsPartialUpdate(Number(id), corps as Parameters<typeof clientsPartialUpdate>[1]),
    onSuccess: () => client.invalidateQueries({ queryKey: ['clients', 'liste'] }),
  });
}
