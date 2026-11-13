import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { actionsSession, cleSession } from './api.ts';
import {
  lireSessionReelle,
  rangerCommandes,
  versClient,
  versLivraison,
  versMouvement,
  versQuantites,
  versSaisies,
} from './reel.ts';
import type { InstantaneSession } from './types.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
const DAVY = { id: 4, nom: 'Davy Caisse' };
const CAISSE = {
  id: 2,
  semaine: 1,
  jour: '2026-11-13',
  creneau: 'jour',
  caissiere: DAVY,
  planifiee: null,
  hors_planning: true,
  fonds: 20000,
  attendu: null,
  compte: null,
  ecart: null,
  statut: 'ouverte',
  en_cours: true,
  ouverte_le: '2026-11-13T08:00:00+01:00',
  fermee_le: null,
};
const ALAIN = {
  id: 1,
  nom: 'Alain',
  type: 'livreur',
  telephone: '+237 6 •• •• 10 45',
  lieu: 'Marché Etoudi',
  plafond: null,
  plafond_effectif: 2000,
  solde: -1140,
  actif: true,
  tarifs: {},
  prix: { BAG: 110, KO: 75, GC135: 165, GC170: null, PL: null, C2: 165, PSL: null },
};
const EBENE = { ...ALAIN, id: 3, nom: 'Ebène', solde: 0 };
const LIVRAISON = {
  id: 6,
  numero: 6,
  caisse: 2,
  jour: '2026-11-13',
  creneau: 'jour',
  client: { id: 1, nom: 'Alain' },
  commande: null,
  statut: 'livree',
  demande: null,
  autorisee_par: '',
  lignes: [
    { code: 'BAG', quantite: 10, prix_unitaire: 110, montant: 1100 },
    { code: 'GC135', quantite: 2, prix_unitaire: 165, montant: 330 },
  ],
  montant_du: 1430,
  recu: 1000,
  reste: -430,
  paiements: [{ mode: 'mtn', montant: 1000, reference: 'MP123' }],
  solde_avant: -710,
  solde_apres: -1140,
  envoi_whatsapp: null,
  cree_par: 'Davy Caisse',
  cree_le: '2026-11-13T08:22:32+01:00',
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurSession() {
  serveur.use(
    http.get('*/api/v1/caisses/', () => HttpResponse.json(page([CAISSE]))),
    http.get('*/api/v1/caisses/recapitulatif/', () => HttpResponse.json([])),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({
        jour: '2026-11-13',
        creneau: 'nuit',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: CAISSE,
      }),
    ),
    http.get('*/api/v1/caisses/2/especes/', () =>
      HttpResponse.json({
        fonds: 20000,
        especes: 1000,
        depenses: 500,
        remises: 0,
        attendu: 20500,
        plafond: 100000,
        remise_proposee: 0,
      }),
    ),
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json(
        page([
          {
            id: 1,
            numero: 46,
            du: '2026-11-09',
            au: '2026-11-15',
            statut: 'ouverte',
            gerant: { id: 3, nom: 'Willy Gérant' },
            production: null,
          },
        ]),
      ),
    ),
    http.get('*/api/v1/clients/', () => HttpResponse.json(page([ALAIN, EBENE]))),
    http.get('*/api/v1/commandes/', ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('jour')).toBe('2026-11-13');
      expect(url.searchParams.get('creneau')).toBe('jour');
      return HttpResponse.json([
        {
          id: 5,
          client: { id: 3, nom: 'Ebène' },
          jour: '2026-11-13',
          creneau: 'jour',
          lignes: { BAG: 40, KO: 10 },
          apres_heure_limite: false,
          tardive: false,
          saisie_par: 'Davy Caisse',
          saisie_le: '2026-11-13T07:00:00+01:00',
          modifiee_le: '2026-11-13T07:00:00+01:00',
        },
      ]);
    }),
    http.get('*/api/v1/commandes/habituels-sans-commande/', () =>
      HttpResponse.json([
        {
          commande: { BAG: 20, GC135: 5 },
          client: { id: 1, nom: 'Alain' },
          telephone: '+237 6 •• •• 10 45',
          sessions: 4,
          rappel: { statut: 'envoye', automatique: false, cree_le: '2026-11-13T07:30:00+01:00' },
        },
      ]),
    ),
    http.get('*/api/v1/livraisons/', () => HttpResponse.json(page([LIVRAISON]))),
    http.get('*/api/v1/mouvements-internes/', () =>
      HttpResponse.json(
        page([
          {
            id: 1,
            caisse: 2,
            genre: 'retours',
            produit: 'BAG',
            quantite: 5,
            motif: 'Invendus',
            cree_par: 'Davy Caisse',
            cree_le: '2026-11-13T09:00:00+01:00',
          },
          {
            id: 2,
            caisse: 2,
            genre: 'ration',
            produit: 'PL',
            quantite: 1,
            motif: '',
            cree_par: 'Davy Caisse',
            cree_le: '2026-11-13T09:05:00+01:00',
          },
        ]),
      ),
    ),
  );
}

describe('lecture de la session sur le vrai serveur', () => {
  it('compose l’instantané : session, clients, commandes, habitués, livraisons, mouvements', async () => {
    serveurSession();
    const instantane = await lireSessionReelle();
    expect(instantane.session).toMatchObject({
      type: 'jour',
      date: '2026-11-13',
      statut: 'ouverte',
      ouverteA: '08:00',
      ouvertePar: 'Davy Caisse',
      fonds: 20000,
      especesComptees: '',
    });
    expect(instantane.plafond).toBe(2000);
    expect(instantane.clients.map((c) => c.nom)).toEqual(['Alain', 'Ebène']);
    expect(instantane.clients[0]).toMatchObject({
      id: '1',
      solde: -1140,
      prix: { BAG: 110, KO: 75, GC: 165 },
    });
    expect(instantane.commandes).toEqual({
      '1': { BAG: '', KO: '', GC: '' },
      '3': { BAG: '40', KO: '10', GC: '' },
    });
    expect(instantane.habituelles).toEqual({ '1': { BAG: 20, KO: 0, GC: 5 } });
    expect(instantane.relances).toEqual({ '1': '07:30' });
    expect(instantane.livraisons).toHaveLength(1);
    expect(instantane.livraisons[0]).toMatchObject({
      id: '6',
      numero: 6,
      nom: 'Alain',
      quantites: { BAG: 10, KO: 0, GC: 2 },
      du: 1430,
      recu: 1000,
      mode: 'mtn',
      reference: 'MP123',
      reste: -430,
      soldeAvant: -710,
      soldeApres: -1140,
      heure: '08:22',
      par: 'Davy Caisse',
    });
    // Un produit hors BAG, KO, GC (ici PL) n'est pas affiché par l'écran.
    expect(instantane.mouvements).toEqual([
      {
        id: '1',
        type: 'retours',
        produit: 'BAG',
        quantite: 5,
        motif: 'Invendus',
        par: 'Davy Caisse',
        heure: '09:00',
      },
    ]);
    expect(instantane.depensesCaisse).toBe(500);
    expect(instantane.dernierBon).toBe('6');
    expect(instantane.numeroProchainBon).toBe(7);
    expect(instantane.echeanceDettes).toBe('2026-11-15');
  });

  it('garde la session quand la liste des habitués est refusée', async () => {
    serveurSession();
    serveur.use(
      http.get('*/api/v1/commandes/habituels-sans-commande/', () =>
        HttpResponse.json({ detail: 'non' }, { status: 403 }),
      ),
    );
    const instantane = await lireSessionReelle();
    expect(instantane.habituelles).toEqual({});
    expect(instantane.relances).toEqual({});
  });

  it('une caisse fermée donne une session clôturée avec ses comptages', async () => {
    serveurSession();
    serveur.use(
      http.get('*/api/v1/caisses/', () =>
        HttpResponse.json(
          page([
            {
              ...CAISSE,
              statut: 'fermee',
              en_cours: false,
              attendu: 21600,
              compte: 21000,
              ecart: -600,
              fermee_le: '2026-11-13T18:00:00+01:00',
            },
          ]),
        ),
      ),
    );
    const { session } = await lireSessionReelle();
    expect(session).toMatchObject({
      statut: 'cloturee',
      clotureeA: '18:00',
      cloturePar: 'Davy Caisse',
      especesComptees: '21000',
    });
  });
});

describe('fonctions de lecture', () => {
  it('traduit les codes de produit du serveur', () => {
    expect(versQuantites({ BAG: 3, GC135: 2, GC170: 9 })).toEqual({ BAG: 3, KO: 0, GC: 2 });
    expect(versSaisies({ BAG: 3, GC135: 2 })).toEqual({ BAG: '3', KO: '', GC: '2' });
    expect(versSaisies(undefined)).toEqual({ BAG: '', KO: '', GC: '' });
  });

  it('un client sans prix connu garde « 0 »', () => {
    expect(versClient({ ...ALAIN, prix: {} } as never).prix).toEqual({ BAG: 0, KO: 0, GC: 0 });
  });

  it('un mode de paiement inconnu devient « espèces », un paiement absent aussi', () => {
    expect(versLivraison({ ...LIVRAISON, paiements: [] } as never).mode).toBe('especes');
    expect(versLivraison({ ...LIVRAISON, paiements: [{ mode: 'x' }] } as never).mode).toBe(
      'especes',
    );
  });

  it('un mouvement d’un genre inconnu est ignoré', () => {
    expect(
      versMouvement({ id: 1, caisse: 2, genre: 'x', produit: 'BAG', quantite: 1 } as never),
    ).toBeUndefined();
  });

  it('range les commandes de chaque client, même sans commande', () => {
    const clients = [versClient(ALAIN as never)];
    expect(rangerCommandes(clients, [], []).commandes).toEqual({
      '1': { BAG: '', KO: '', GC: '' },
    });
  });
});

describe('écritures des commandes sur le vrai serveur', () => {
  const instantaneDe = (): InstantaneSession =>
    ({
      session: { type: 'jour', date: '2026-11-13', statut: 'ouverte' },
      commandes: { '3': { BAG: '', KO: '', GC: '' } },
    }) as unknown as InstantaneSession;

  it('envoie la commande entière du client une fois la frappe arrêtée, avec la session visée', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    const recus: unknown[] = [];
    serveurSession();
    serveur.use(
      http.post('*/api/v1/commandes/', async ({ request }) => {
        recus.push(await request.json());
        return HttpResponse.json({ id: 5 }, { status: 201 });
      }),
    );
    const actions = actionsSession(client, 'Davy');
    actions.saisirCommande('3', 'BAG', '4');
    actions.saisirCommande('3', 'BAG', '40');
    actions.saisirCommande('3', 'KO', '10');
    // Le champ réagit tout de suite.
    expect(client.getQueryData<InstantaneSession>(cleSession('Davy'))?.commandes['3']).toEqual({
      BAG: '40',
      KO: '10',
      GC: '',
    });
    expect(recus).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(700);
    await vi.waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]).toEqual({
      client: 3,
      jour: '2026-11-13',
      creneau: 'jour',
      lignes: { BAG: 40, KO: 10, GC135: 0 },
    });
    vi.useRealTimers();
  });

  it('relance les habitués et reprend une habituelle pour la session visée', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    serveurSession();
    let relance: unknown;
    let reprise: unknown;
    serveur.use(
      http.post('*/api/v1/commandes/relancer-habituels/', async ({ request }) => {
        relance = await request.json();
        return HttpResponse.json([]);
      }),
      http.post('*/api/v1/commandes/reprendre-habituelle/', async ({ request }) => {
        reprise = await request.json();
        return HttpResponse.json({ id: 5 });
      }),
    );
    const actions = actionsSession(client, 'Davy');
    await actions.relancer(['1', '3']);
    await actions.reprendreHabituelle('1');
    expect(relance).toEqual({ jour: '2026-11-13', creneau: 'jour', clients: [1, 3] });
    expect(reprise).toEqual({ client: 1, jour: '2026-11-13', creneau: 'jour' });
    // Le cache reçoit l'instantané relu sur le serveur.
    expect(client.getQueryData<InstantaneSession>(cleSession('Davy'))?.livraisons).toHaveLength(1);
  });

  it('refuse les écritures pas encore branchées (livraison, mouvement, clôture)', async () => {
    const client = new QueryClient();
    const actions = actionsSession(client, 'Davy');
    await expect(actions.cloturer()).rejects.toThrow('pas encore branchée');
    await expect(actions.ajouterMouvement({} as never)).rejects.toThrow('pas encore branchée');
  });
});
