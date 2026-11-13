import type { Profil } from '../profils.ts';
import { valeurDuParametre } from './parametres.ts';
import { soldesDesClientsDeSession } from './comptoir.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Clients et dettes simulés (maquette « OptiBoul ERP v2 » : 12 clients, tarifs par client,
 * soldes, plafond de 2 000 FCFA, échéance le dimanche). Lus par l'écran « Clients et dettes »
 * et par l'écran « Session » : route stable `/api/v1/simulation/clients/`.
 * Données littérales, sans appel de fonction : le paquet de production n'en embarque aucune.
 */

export type TypeClient = 'livreur' | 'restaurant' | 'hotel' | 'particulier';

export type TarifsClient = { BAG: number; KO: number; GC: number };

export type ClientSimule = {
  id: string;
  nom: string;
  /** Catégorie du client ; l'interface la traduit. */
  type: TypeClient;
  lieu: string;
  telephone: string;
  /** Prix unitaire de chaque pain pour ce client, en FCFA. */
  tarifs: TarifsClient;
  /** Solde en FCFA entier : négatif = le client doit de l'argent. */
  solde: number;
  /** Une relance WhatsApp a déjà été envoyée à ce client. */
  relance: boolean;
  /** Plafond propre à ce client ; absent : celui de la liste. */
  plafond?: number;
};

export type ListeClientsSimulee = {
  /** Plafond de dette par client, en FCFA. */
  plafond: number;
  /** Date limite de règlement (le dimanche de la semaine), `AAAA-MM-JJ`. */
  echeance: string;
  clients: ClientSimule[];
};

/** Une ligne de l'historique d'un client : livraison, avec ce qui était dû et ce qui a été payé. */
export type LigneHistoriqueClient = {
  /** Numéro du bon de livraison. */
  bon: number;
  /** Jour de la session, `AAAA-MM-JJ`. */
  date: string;
  /** Heure de la livraison (`21:41`) ou `nuit` pour une session passée (traduit par l'interface). */
  moment: string;
  du: number;
  recu: number;
};

const A: TarifsClient = { BAG: 100, KO: 70, GC: 160 };
const B: TarifsClient = { BAG: 110, KO: 75, GC: 165 };

const CLIENTS: readonly ClientSimule[] = [
  {
    id: 'alain',
    nom: 'Alain',
    type: 'livreur',
    lieu: 'Marché Etoudi',
    telephone: '6 77 21 45 10',
    tarifs: B,
    solde: -1250,
    relance: false,
  },
  {
    id: 'alex',
    nom: 'Alex',
    type: 'livreur',
    lieu: 'Carrefour Emana',
    telephone: '6 99 08 33 41',
    tarifs: A,
    solde: 0,
    relance: false,
  },
  {
    id: 'ebene',
    nom: 'Ebène',
    type: 'livreur',
    lieu: 'Lycée d’Etoudi',
    telephone: '6 55 72 19 08',
    tarifs: A,
    solde: -2350,
    relance: false,
  },
  {
    id: 'white',
    nom: 'White',
    type: 'livreur',
    lieu: 'Olembé',
    telephone: '6 78 40 12 66',
    tarifs: B,
    solde: -500,
    relance: false,
  },
  {
    id: 'ngono',
    nom: 'Mama Ngono',
    type: 'livreur',
    lieu: 'Marché Etoudi',
    telephone: '6 94 15 70 22',
    tarifs: A,
    solde: 0,
    relance: false,
  },
  {
    id: 'junior',
    nom: 'Junior',
    type: 'livreur',
    lieu: 'Messassi',
    telephone: '6 70 66 01 93',
    tarifs: A,
    solde: -1900,
    relance: false,
  },
  {
    id: 'brice',
    nom: 'Brice',
    type: 'livreur',
    lieu: 'Nkolondom',
    telephone: '6 51 38 27 74',
    tarifs: { BAG: 100, KO: 75, GC: 165 },
    solde: -4200,
    relance: false,
  },
  {
    id: 'clarisse',
    nom: 'Clarisse',
    type: 'livreur',
    lieu: 'Emana',
    telephone: '6 97 82 64 05',
    tarifs: A,
    solde: -300,
    relance: false,
  },
  {
    id: 'herve',
    nom: 'Hervé',
    type: 'restaurant',
    lieu: 'Etoudi Château',
    telephone: '6 76 59 30 18',
    tarifs: B,
    solde: 0,
    relance: false,
  },
  {
    id: 'sandrine',
    nom: 'Sandrine',
    type: 'livreur',
    lieu: 'Olembé',
    telephone: '6 93 24 81 57',
    tarifs: A,
    solde: -2750,
    relance: false,
  },
  {
    id: 'yannick',
    nom: 'Yannick',
    type: 'livreur',
    lieu: 'Messassi',
    telephone: '6 58 11 96 42',
    tarifs: A,
    solde: -800,
    relance: false,
  },
  {
    id: 'aicha',
    nom: 'Aïcha',
    type: 'hotel',
    lieu: 'Carrefour Emana',
    telephone: '6 90 47 05 36',
    tarifs: A,
    solde: 0,
    relance: false,
  },
];

/** Livraisons de la session en cours (14 oct., nuit), les plus récentes d'abord. */
const LIVRAISONS_DU_JOUR: Record<string, LigneHistoriqueClient> = {
  aicha: { bon: 146, date: '2026-10-14', moment: '21:41', du: 7800, recu: 7800 },
  herve: { bon: 145, date: '2026-10-14', moment: '21:28', du: 11550, recu: 11550 },
  ngono: { bon: 144, date: '2026-10-14', moment: '21:15', du: 16700, recu: 16700 },
  white: { bon: 143, date: '2026-10-14', moment: '21:02', du: 10700, recu: 10200 },
  alex: { bon: 142, date: '2026-10-14', moment: '20:51', du: 12200, recu: 12200 },
};

/** Plafond de dette en vigueur (paramètre `plafond_dette_client`), lu à chaque appel. */
export const plafondDeDette = (): number => valeurDuParametre('plafond_dette_client');
const ECHEANCE = '2026-10-18';

/** Clients ayant déjà reçu une relance pendant cette démonstration. */
const relances = new Set<string>();

/** Remet les relances à zéro (tests). */
export function reinitialiserClients(): void {
  relances.clear();
}

/** Les profils qui peuvent relancer : la caissière voit les dettes, mais ne relance pas. */
const PEUT_RELANCER: readonly Profil[] = ['gerant', 'proprietaire'];

const PEUT_VOIR: readonly Profil[] = ['caissier', 'gerant', 'proprietaire'];

/**
 * Clients tels que la route les sert (avec l'état des relances). Le solde est celui de la session
 * du comptoir : une livraison à crédit y change aussi l'écran « Clients et dettes ».
 */
export function clientsSimules(): ClientSimule[] {
  const soldes = soldesDesClientsDeSession();
  return CLIENTS.map((client) => ({
    ...client,
    solde: soldes[client.id] ?? client.solde,
    relance: relances.has(client.id),
  }));
}

function historiqueDe(client: ClientSimule): LigneHistoriqueClient[] {
  const duJour = LIVRAISONS_DU_JOUR[client.id];
  return [
    ...(duJour ? [duJour] : []),
    {
      bon: 128,
      date: '2026-10-13',
      moment: 'nuit',
      du: 9800,
      recu: 9800 + Math.min(0, client.solde),
    },
    { bon: 103, date: '2026-10-12', moment: 'nuit', du: 11200, recu: 11200 },
  ];
}

const refuser = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

/**
 * Routes simulées des clients ; `null` quand l'appel n'est pas pour elles.
 * - GET  /api/v1/simulation/clients/                    liste, plafond, échéance
 * - GET  /api/v1/simulation/clients/<id>/historique/    livraisons du client
 * - POST /api/v1/simulation/clients/relancer/           { ids } : gérant et propriétaire seulement
 */
export function repondreClients(
  methode: string,
  chemin: string,
  corps: Record<string, unknown>,
): Response | null {
  const prefixe = '/api/v1/simulation/clients/';
  if (!chemin.startsWith(prefixe)) return null;
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return refuser(403, 'non_authentifie', 'Connexion requise.');
  if (!PEUT_VOIR.includes(utilisateur.profil)) {
    return refuser(403, 'interdit', 'Votre profil ne voit pas les clients.');
  }
  const reste = chemin.slice(prefixe.length);

  if (methode === 'GET' && reste === '') {
    const liste: ListeClientsSimulee = {
      plafond: plafondDeDette(),
      echeance: ECHEANCE,
      clients: clientsSimules(),
    };
    return Response.json(liste);
  }

  const historique = /^([a-z]+)\/historique\/$/.exec(reste);
  if (methode === 'GET' && historique) {
    const client = CLIENTS.find((c) => c.id === historique[1]);
    if (!client) return refuser(404, 'client_inconnu', 'Client inconnu.');
    return Response.json(historiqueDe(client));
  }

  if (methode === 'POST' && reste === 'relancer/') {
    if (!PEUT_RELANCER.includes(utilisateur.profil)) {
      return refuser(403, 'interdit', 'Seuls le gérant et le propriétaire relancent les clients.');
    }
    const ids = Array.isArray(corps.ids) ? corps.ids.map(String) : [];
    const connus = ids.filter((id) => CLIENTS.some((c) => c.id === id && c.solde < 0));
    for (const id of connus) relances.add(id);
    return Response.json({ relances: connus.length });
  }

  return null;
}
