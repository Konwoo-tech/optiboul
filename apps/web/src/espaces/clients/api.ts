import {
  clientsDettesRetrieve,
  clientsList,
  livraisonsList,
  type Client,
  type Livraison,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useContexte } from '@/coque/contexte.ts';
import {
  SIMULATION,
  useClientsSimules,
  useHistoriqueClientSimule,
  type ClientSimule,
  type LigneHistoriqueClient,
  type ListeClientsSimulee,
} from '@/simulation';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const FUSEAU = 'Africa/Douala';
/** Plafond de dette par défaut (R6) si le serveur ne dit rien : paramètre `plafond_dette_client`. */
const PLAFOND_PAR_DEFAUT = 2000;

/**
 * Relances WhatsApp et envoi du relevé : branchés à l'étape « relances et relevé » (#269). D'ici là,
 * l'écran ne les propose pas sur le vrai serveur (pas de faux « envoyé »).
 */
export const RELANCES_ET_RELEVE_DISPONIBLES = SIMULATION;

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Toutes les pages d'une liste paginée (`PageNumberPagination`, 50 par page). */
async function toutesLesPages<T>(lire: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const tous: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const reponse = await lire(page);
    tous.push(...(reponse.data.results ?? []));
    if (!reponse.data.next) break;
  }
  return tous;
}

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
export function versClientDeLecran(client: Client, relances: ReadonlySet<number>): ClientSimule {
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
  };
}

/** Plafond le plus courant parmi les clients : celui qu'affiche « au-delà de … » dans les chiffres. */
export function plafondCourant(clients: readonly ClientSimule[]): number {
  const nombres = new Map<number, number>();
  for (const client of clients) {
    if (client.plafond !== undefined)
      nombres.set(client.plafond, (nombres.get(client.plafond) ?? 0) + 1);
  }
  const [courant] = [...nombres].sort((a, b) => b[1] - a[1])[0] ?? [];
  return courant ?? PLAFOND_PAR_DEFAUT;
}

async function lireClients(): Promise<Omit<ListeClientsSimulee, 'echeance'>> {
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
 * `GET /clients/dettes/` (dernière relance) ; en simulation : le faux serveur. La date limite de
 * règlement est le dimanche de la semaine ouverte.
 */
export function useClients(): {
  data: ListeClientsSimulee | undefined;
  isPending: boolean;
  isError: boolean;
} {
  const { utilisateur } = useUtilisateurCourant();
  const { data: contexte } = useContexte();
  const simules = useClientsSimules();
  const reels = useQuery({
    queryKey: ['clients', 'liste', utilisateur?.url],
    queryFn: lireClients,
    enabled: !SIMULATION && Boolean(utilisateur),
  });
  const echeance = contexte?.semaine.au ?? dimancheDeLaSemaine();
  const data = useMemo(
    () => (reels.data ? { ...reels.data, echeance } : undefined),
    [reels.data, echeance],
  );
  if (SIMULATION) {
    return { data: simules.data, isPending: simules.isPending, isError: simules.isError };
  }
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
  const simule = useHistoriqueClientSimule(id);
  const reel = useQuery({
    queryKey: ['clients', 'historique', id],
    queryFn: () => lireHistorique(id as string),
    enabled: !SIMULATION && id !== null,
  });
  return SIMULATION ? simule : reel;
}
