import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { actionsSession, cleSession, envoyerBonParWhatsapp } from './api.ts';
import {
  lireSessionReelle,
  rangerCommandes,
  versClient,
  versLivraison,
  versMouvement,
  versDemandePlafond,
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
const DEMANDE = {
  id: 12,
  numero: 12,
  code: 'DEM-012',
  type: 'plafond',
  type_libelle: 'Livraison au-delà du plafond',
  objet_type: 'livraison',
  objet_id: 7,
  objet: 'Alain · bon n° 7 · 3000 FCFA',
  details: {
    client: 1,
    client_nom: 'Alain',
    numero: 7,
    montant_du: 3000,
    solde_avant: -1140,
    solde_apres: -3000,
    plafond: 2000,
  },
  motif: 'Dépassement du plafond de dette du client',
  emetteur: { id: 4, nom: 'Davy Caisse' },
  emetteur_profil: 'caissier',
  valideurs: ['gerant', 'proprietaire'],
  statut: 'en_attente',
  cree_le: '2026-11-13T09:15:00+01:00',
  echeance: '2026-11-13T09:25:00+01:00',
  escaladee_le: null,
  decide_par_nom: '',
  decide_le: null,
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
    http.get('*/api/v1/demandes/', ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('statut')).toBe('en_attente');
      expect(url.searchParams.get('type')).toBe('plafond');
      return HttpResponse.json(page([DEMANDE, { ...DEMANDE, id: 13, type: 'depense' }]));
    }),
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
    // Seules les demandes de plafond en attente sont reprises.
    expect(instantane.demandes).toEqual([
      {
        id: '12',
        numero: 12,
        clientId: '1',
        clientNom: 'Alain',
        soldeApres: -3000,
        plafond: 2000,
        par: 'Davy Caisse',
        jour: '2026-11-13',
        heure: '09:15',
        statut: 'en-attente',
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

  it('refuse de fermer ou de rouvrir sans caisse identifiée, sans appeler le serveur', async () => {
    const client = new QueryClient();
    const actions = actionsSession(client, 'Davy');
    await expect(actions.cloturer()).rejects.toThrow('pas encore branchée');
    await expect(actions.rouvrir('motif')).rejects.toThrow('pas encore branchée');
  });
});

describe('livraisons et accords de plafond sur le vrai serveur', () => {
  const instantaneDe = (): InstantaneSession =>
    ({
      session: { type: 'jour', date: '2026-11-13', statut: 'ouverte' },
      commandes: {},
      demandes: [
        {
          id: '12',
          numero: 12,
          clientId: '1',
          clientNom: 'Alain',
          soldeApres: -3000,
          plafond: 2000,
          par: 'Davy Caisse',
          jour: '2026-11-13',
          heure: '09:15',
          statut: 'en-attente',
        },
      ],
    }) as unknown as InstantaneSession;
  const livraison = {
    clientId: '1',
    quantites: { BAG: 10, KO: 0, GC: 2 },
    mode: 'mtn' as const,
    recu: 1000,
    reference: 'MP123',
    cle: 'cle-fixe',
  };

  it('livre : produits en codes serveur, paiement, clé d’idempotence ; renvoie le bon relu', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    serveurSession();
    let corps: unknown;
    let cle: string | null = null;
    serveur.use(
      http.post('*/api/v1/livraisons/', async ({ request }) => {
        corps = await request.json();
        cle = request.headers.get('Idempotency-Key');
        return HttpResponse.json(LIVRAISON, { status: 201 });
      }),
    );
    const reponse = await actionsSession(client, 'Davy').livrer(livraison);
    expect(corps).toEqual({
      client: 1,
      lignes: { BAG: 10, KO: 0, GC135: 2 },
      paiement: { mode: 'mtn', montant: 1000, reference: 'MP123' },
    });
    expect(cle).toBe('cle-fixe');
    expect(reponse.livraison).toMatchObject({ id: '6', numero: 6, nom: 'Alain', du: 1430 });
  });

  it('sans montant reçu, la livraison part sans paiement ; un refus du serveur remonte son code', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    serveurSession();
    const recus: { paiement?: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/livraisons/', async ({ request }) => {
        recus.push((await request.json()) as { paiement?: unknown });
        return recus.length === 1
          ? HttpResponse.json(LIVRAISON, { status: 201 })
          : HttpResponse.json(
              { detail: 'Plafond de dette dépassé', code: 'plafond_depasse', manque: 8000 },
              { status: 409 },
            );
      }),
    );
    const actions = actionsSession(client, 'Davy');
    await actions.livrer({ ...livraison, recu: 0, reference: '' });
    expect(recus[0]?.paiement).toBeNull();
    await expect(actions.livrer(livraison)).rejects.toMatchObject({
      status: 409,
      code: 'plafond_depasse',
    });
  });

  it('demande l’accord : la livraison entière part avec un motif, la demande en attente revient', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    serveurSession();
    let corps: { demander_autorisation?: string } | undefined;
    serveur.use(
      http.post('*/api/v1/livraisons/', async ({ request }) => {
        corps = (await request.json()) as typeof corps;
        return HttpResponse.json({ ...LIVRAISON, statut: 'en_attente' }, { status: 202 });
      }),
    );
    const reponse = await actionsSession(client, 'Davy').demanderAutorisation(
      '1',
      -3000,
      livraison,
    );
    expect(corps?.demander_autorisation).toBeTruthy();
    expect(reponse.autorise).toBe(false);
    expect(reponse.demande).toMatchObject({ id: '12', clientId: '1', statut: 'en-attente' });
  });

  it('le gérant qui émet la demande est livré d’emblée (201) : aucune demande à valider', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Willy'), instantaneDe());
    serveurSession();
    serveur.use(
      http.post('*/api/v1/livraisons/', () => HttpResponse.json(LIVRAISON, { status: 201 })),
    );
    const reponse = await actionsSession(client, 'Willy').demanderAutorisation(
      '1',
      -3000,
      livraison,
    );
    expect(reponse.autorise).toBe(true);
    expect(reponse.demande).toBeUndefined();
  });

  it('accorde ou refuse avec le code du gérant de la semaine (caissière connectée)', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe());
    serveurSession();
    const recus: { chemin: string; corps: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/demandes/:id/:decision/', async ({ request, params }) => {
        recus.push({ chemin: String(params.decision), corps: await request.json() });
        return HttpResponse.json(DEMANDE);
      }),
    );
    const actions = actionsSession(client, 'Davy', { id: '4', profil: 'caissier' });
    const accord = await actions.deciderAutorisation('12', '3333', true);
    await actions.deciderAutorisation('12', '3333', false);
    expect(recus[0]).toEqual({
      chemin: 'accorder',
      corps: { code_gerant: { utilisateur: 3, code: '3333' } },
    });
    expect(recus[1]?.chemin).toBe('refuser');
    expect(recus[1]?.corps).toMatchObject({ code_gerant: { utilisateur: 3, code: '3333' } });
    expect(recus[1]?.corps).toMatchObject({ motif: expect.any(String) });
    expect(accord.demande).toMatchObject({ id: '12', statut: 'acceptee' });
  });

  it('le gérant connecté décide avec son propre code ; un code faux remonte « code_incorrect »', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Willy'), instantaneDe());
    serveurSession();
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/demandes/12/accorder/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json(
          { detail: 'Code incorrect', code: 'code_incorrect', essaisRestants: 2 },
          { status: 400 },
        );
      }),
    );
    const actions = actionsSession(client, 'Willy', { id: '3', profil: 'gerant' });
    await expect(actions.deciderAutorisation('12', '0000', true)).rejects.toMatchObject({
      code: 'code_incorrect',
    });
    expect(corps).toEqual({ code_gerant: { utilisateur: 3, code: '0000' } });
  });

  it('envoie le bon par WhatsApp : 202 ; sans numéro, le refus remonte', async () => {
    serveur.use(
      http.post('*/api/v1/livraisons/6/envoyer-whatsapp/', () =>
        HttpResponse.json({ id: 1 }, { status: 202 }),
      ),
      http.post('*/api/v1/livraisons/7/envoyer-whatsapp/', () =>
        HttpResponse.json({ detail: 'Pas de numéro', code: 'sans_telephone' }, { status: 409 }),
      ),
    );
    await expect(envoyerBonParWhatsapp('6')).resolves.toBeUndefined();
    await expect(envoyerBonParWhatsapp('7')).rejects.toMatchObject({ status: 409 });
  });

  it('une demande d’un autre type n’est pas une demande de plafond', () => {
    expect(versDemandePlafond({ ...DEMANDE, type: 'depense' } as never)).toBeUndefined();
  });
});

describe('demande d’un gérant', () => {
  it('attend un autre valideur : aucune fenêtre de code, aucune tentative de valider soi-même', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Willy'), {
      session: { type: 'jour', date: '2026-11-13', statut: 'ouverte' },
      commandes: {},
      demandes: [],
    } as unknown as InstantaneSession);
    serveurSession();
    let accorde = false;
    serveur.use(
      http.post('*/api/v1/livraisons/', () =>
        HttpResponse.json({ ...LIVRAISON, statut: 'en_attente' }, { status: 202 }),
      ),
      http.post('*/api/v1/demandes/:id/accorder/', () => {
        accorde = true;
        return HttpResponse.json(DEMANDE);
      }),
    );
    const reponse = await actionsSession(client, 'Willy', {
      id: '3',
      profil: 'gerant',
    }).demanderAutorisation('1', -3000, {
      clientId: '1',
      quantites: { BAG: 10, KO: 0, GC: 0 },
      mode: 'especes',
      recu: 0,
      reference: '',
      cle: 'k',
    });
    expect(accorde).toBe(false);
    expect(reponse.autorise).toBe(false);
    expect(reponse.demande).toBeUndefined();
  });
});

describe('paiement d’une dette sans livraison sur le vrai serveur', () => {
  it('envoie le montant, le mode et la référence avec une clé d’idempotence, puis relit la session', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), {
      session: { type: 'jour', date: '2026-11-13', statut: 'ouverte' },
      commandes: {},
      demandes: [],
    } as unknown as InstantaneSession);
    serveurSession();
    let corps: unknown;
    let cle: string | null = null;
    serveur.use(
      http.post('*/api/v1/encaissements/', async ({ request }) => {
        corps = await request.json();
        cle = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          {
            id: 3,
            caisse: 2,
            client: { id: 1, nom: 'Alain' },
            livraison: null,
            mode: 'mtn',
            montant: 500,
            reference: 'MP1',
            cree_par: 'Davy Caisse',
            cree_le: '2026-11-13T10:00:00+01:00',
          },
          { status: 201 },
        );
      }),
    );
    const reponse = await actionsSession(client, 'Davy').encaisser({
      clientId: '1',
      mode: 'mtn',
      recu: 500,
      reference: 'MP1',
      cle: 'cle-paiement',
    });
    expect(corps).toEqual({ client: 1, mode: 'mtn', montant: 500, reference: 'MP1' });
    expect(cle).toBe('cle-paiement');
    expect(reponse.instantane.clients.map((c) => c.nom)).toContain('Alain');
  });
});

describe('mouvements et clôture sur le vrai serveur', () => {
  const instantaneDe = (especesComptees: string): InstantaneSession =>
    ({
      session: {
        caisseId: '2',
        type: 'jour',
        date: '2026-11-13',
        statut: 'ouverte',
        especesComptees,
      },
      commandes: {},
      demandes: [],
    }) as unknown as InstantaneSession;

  it('ajoute un mouvement : genre et produit en codes serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe(''));
    serveurSession();
    const recus: unknown[] = [];
    serveur.use(
      http.post('*/api/v1/mouvements-internes/', async ({ request }) => {
        recus.push(await request.json());
        return HttpResponse.json({ id: 9 }, { status: 201 });
      }),
    );
    const actions = actionsSession(client, 'Davy');
    await actions.ajouterMouvement({
      type: 'reste-en-salle',
      produit: 'GC',
      quantite: 3,
      motif: 'Invendus',
    });
    await actions.ajouterMouvement({
      type: 'ration',
      produit: 'BAG',
      quantite: 1,
      motif: 'Équipe',
    });
    expect(recus).toEqual([
      { genre: 'reste_en_salle', produit: 'GC135', quantite: 3, motif: 'Invendus' },
      { genre: 'ration', produit: 'BAG', quantite: 1, motif: 'Équipe' },
    ]);
  });

  it('clôture avec le comptage saisi et relit la session', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe('21000'));
    serveurSession();
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/caisses/2/fermer/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ caisse: CAISSE, resultat: 'manque' });
      }),
    );
    const reponse = await actionsSession(client, 'Davy').cloturer();
    expect(corps).toEqual({ compte: 21000 });
    expect(reponse.instantane.session.caisseId).toBe('2');
  });

  it('refuse de clôturer sans comptage, sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Davy'), instantaneDe(''));
    await expect(actionsSession(client, 'Davy').cloturer()).rejects.toMatchObject({
      code: 'comptage_requis',
    });
  });

  it('rouvre avec un motif ; ouvre la suivante avec le fonds proposé', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSession('Willy'), instantaneDe(''));
    serveurSession();
    let motif: unknown;
    let fonds: unknown;
    serveur.use(
      http.post('*/api/v1/caisses/2/rouvrir/', async ({ request }) => {
        motif = await request.json();
        return HttpResponse.json(CAISSE);
      }),
      http.post('*/api/v1/caisses/ouvrir/', async ({ request }) => {
        fonds = await request.json();
        return HttpResponse.json(CAISSE, { status: 201 });
      }),
    );
    const actions = actionsSession(client, 'Willy');
    await actions.rouvrir('Erreur de comptage');
    await actions.ouvrirSuivante();
    expect(motif).toEqual({ motif: 'Erreur de comptage' });
    expect(fonds).toEqual({ fonds: 20000 });
  });

  it('les espèces attendues viennent du serveur (paiements et remises compris)', async () => {
    serveurSession();
    const instantane = await lireSessionReelle();
    expect(instantane.especesAttendues).toBe(20500);
    expect(instantane.session.caisseId).toBe('2');
  });
});
