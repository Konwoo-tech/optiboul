import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  dimancheDeLaSemaine,
  momentDeLivraison,
  plafondCourant,
  useClients,
  useHistoriqueClient,
  versClientDeLecran,
} from './api.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
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
  tarifs: { BAG: 110, KO: 75, GC135: 165 },
  prix: { BAG: 110, KO: 75, GC135: 165, GC170: null, PL: null, C2: 165, PSL: null },
};
const ALEX = {
  ...ALAIN,
  id: 2,
  nom: 'Alex',
  type: 'particulier',
  solde: 0,
  tarifs: {},
  prix: { BAG: 100, KO: 70, GC135: 160, GC170: null, PL: null, C2: 165, PSL: null },
};
const DETTES = {
  nombre: 1,
  total: 1140,
  clients: [
    {
      id: 1,
      nom: 'Alain',
      solde: -1140,
      plafond: 2000,
      jauge: 57,
      statut: 'dette',
      reportee: false,
      derniere_livraison: '2026-11-13T02:45:51+01:00',
      derniere_relance: { id: 9, motif: 'dette', montant: 1140 },
    },
  ],
};

function connecte() {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        url: 'http://localhost/api/v1/users/4/',
        name: 'Davy',
        profil: 'caissier',
      }),
    ),
    // Le contexte de la coque (échéance) : une semaine ouverte.
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            numero: 46,
            du: '2026-11-09',
            au: '2026-11-15',
            statut: 'ouverte',
            gerant: null,
            production: null,
          },
        ],
      }),
    ),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({ detail: 'x' }, { status: 403 }),
    ),
    http.get('*/api/v1/postes/actuel/', () => HttpResponse.json({ detail: 'x' }, { status: 403 })),
  );
}

function Liste() {
  const { data, isPending, isError } = useClients();
  return (
    <pre data-testid="liste">{JSON.stringify({ data: data ?? null, isPending, isError })}</pre>
  );
}

function Historique({ id }: { id: string | null }) {
  const { data } = useHistoriqueClient(id);
  return <pre data-testid="historique">{JSON.stringify(data ?? null)}</pre>;
}

function ouvrir(contenu: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{contenu}</QueryClientProvider>);
}

describe('lecture des clients sur le vrai serveur', () => {
  it('lit toutes les pages, la dernière relance et l’échéance de la semaine ouverte', async () => {
    connecte();
    const pages: string[] = [];
    serveur.use(
      http.get('*/api/v1/clients/', ({ request }) => {
        const url = new URL(request.url);
        pages.push(`${url.searchParams.get('page')}|${url.searchParams.get('actif')}`);
        return url.searchParams.get('page') === '1'
          ? HttpResponse.json({
              count: 2,
              next: 'http://localhost/api/v1/clients/?page=2',
              previous: null,
              results: [ALAIN],
            })
          : HttpResponse.json({ count: 2, next: null, previous: 'x', results: [ALEX] });
      }),
      http.get('*/api/v1/clients/dettes/', () => HttpResponse.json(DETTES)),
    );
    ouvrir(<Liste />);
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('liste').textContent!).data).not.toBeNull(),
    );
    const { data } = JSON.parse(screen.getByTestId('liste').textContent!);
    expect(pages).toEqual(['1|true', '2|true']);
    expect(data.echeance).toBe('2026-11-15');
    expect(data.plafond).toBe(2000);
    expect(data.clients).toEqual([
      {
        id: '1',
        nom: 'Alain',
        type: 'livreur',
        lieu: 'Marché Etoudi',
        telephone: '+237 6 •• •• 10 45',
        tarifs: { BAG: 110, KO: 75, GC: 165 },
        solde: -1140,
        relance: true,
        plafond: 2000,
      },
      expect.objectContaining({
        id: '2',
        nom: 'Alex',
        type: 'particulier',
        solde: 0,
        relance: false,
        tarifs: { BAG: 100, KO: 70, GC: 160 },
      }),
    ]);
  });

  it('garde la liste malgré un refus de la route des dettes (relance inconnue)', async () => {
    connecte();
    serveur.use(
      http.get('*/api/v1/clients/', () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [ALAIN] }),
      ),
      http.get('*/api/v1/clients/dettes/', () =>
        HttpResponse.json({ detail: 'non' }, { status: 403 }),
      ),
    );
    ouvrir(<Liste />);
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('liste').textContent!).data).not.toBeNull(),
    );
    expect(JSON.parse(screen.getByTestId('liste').textContent!).data.clients[0].relance).toBe(
      false,
    );
  });

  it('signale une erreur quand la liste est refusée', async () => {
    connecte();
    serveur.use(
      http.get('*/api/v1/clients/', () => HttpResponse.json({ detail: 'non' }, { status: 500 })),
      http.get('*/api/v1/clients/dettes/', () => HttpResponse.json(DETTES)),
    );
    ouvrir(<Liste />);
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('liste').textContent!).isError).toBe(true),
    );
  });

  it('ne demande rien avant la connexion', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => new HttpResponse(null, { status: 403 })));
    let demandes = 0;
    serveur.events.on('request:start', ({ request }) => {
      if (request.url.includes('/clients/')) demandes += 1;
    });
    ouvrir(<Liste />);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(demandes).toBe(0);
  });
});

describe('historique d’un client sur le vrai serveur', () => {
  it('liste les livraisons livrées, la plus récente d’abord, avec leur bon', async () => {
    connecte();
    const livraison = (
      numero: number,
      statut: string,
      du: number,
      recu: number,
      jour = '2026-11-10',
    ) => ({
      id: numero,
      numero,
      jour,
      creneau: 'nuit',
      statut,
      montant_du: du,
      recu,
      cree_le: '2026-11-10T21:41:00+01:00',
    });
    serveur.use(
      http.get('*/api/v1/livraisons/', ({ request }) => {
        expect(new URL(request.url).searchParams.get('client')).toBe('1');
        return HttpResponse.json({
          count: 3,
          next: null,
          previous: null,
          results: [
            livraison(3, 'livree', 1000, 600),
            livraison(5, 'livree', 1140, 0),
            livraison(4, 'annulee', 500, 0),
          ],
        });
      }),
    );
    ouvrir(<Historique id="1" />);
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('historique').textContent!)).not.toBeNull(),
    );
    expect(JSON.parse(screen.getByTestId('historique').textContent!)).toEqual([
      { bon: 5, date: '2026-11-10', moment: 'nuit', du: 1140, recu: 0 },
      { bon: 3, date: '2026-11-10', moment: 'nuit', du: 1000, recu: 600 },
    ]);
  });

  it('ne demande rien tant qu’aucun client n’est choisi', async () => {
    connecte();
    let demandes = 0;
    serveur.events.on('request:start', ({ request }) => {
      if (request.url.includes('/livraisons/')) demandes += 1;
    });
    ouvrir(<Historique id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(demandes).toBe(0);
  });
});

describe('fonctions de lecture', () => {
  it('traduit un client du serveur : identifiants en chaînes, prix appliqués, plafond effectif', () => {
    const client = versClientDeLecran(
      { ...ALAIN, plafond: 5000, plafond_effectif: 5000 } as never,
      new Set([1]),
    );
    expect(client).toMatchObject({
      id: '1',
      plafond: 5000,
      relance: true,
      tarifs: { BAG: 110, KO: 75, GC: 165 },
    });
  });

  it('garde « 0 » quand un prix manque, et le type livreur par défaut', () => {
    const client = versClientDeLecran(
      { ...ALAIN, type: undefined, prix: { BAG: 100 } } as never,
      new Set(),
    );
    expect(client).toMatchObject({ type: 'livreur', tarifs: { BAG: 100, KO: 0, GC: 0 } });
  });

  it('le plafond courant est le plus fréquent, 2 000 à défaut', () => {
    const avec = (plafond?: number) => ({ plafond }) as never;
    expect(plafondCourant([avec(2000), avec(5000), avec(2000)])).toBe(2000);
    expect(plafondCourant([avec(5000), avec(2000), avec(5000)])).toBe(5000);
    expect(plafondCourant([])).toBe(2000);
    expect(plafondCourant([avec(undefined)])).toBe(2000);
  });

  it('l’échéance est le dimanche de la semaine, à l’heure de Yaoundé', () => {
    expect(dimancheDeLaSemaine(new Date('2026-11-13T10:00:00+01:00'))).toBe('2026-11-15');
    expect(dimancheDeLaSemaine(new Date('2026-11-15T10:00:00+01:00'))).toBe('2026-11-15');
    expect(dimancheDeLaSemaine(new Date('2026-11-16T00:30:00+01:00'))).toBe('2026-11-22');
    // 23:30 UTC le samedi = 00:30 le dimanche à Yaoundé.
    expect(dimancheDeLaSemaine(new Date('2026-11-14T23:30:00Z'))).toBe('2026-11-15');
  });

  it('le moment d’une livraison : l’heure si elle date d’aujourd’hui, sinon le créneau', () => {
    const maintenant = new Date('2026-11-13T12:00:00+01:00');
    expect(
      momentDeLivraison({ cree_le: '2026-11-13T02:45:00+01:00', creneau: 'nuit' }, maintenant),
    ).toBe('02:45');
    expect(
      momentDeLivraison({ cree_le: '2026-11-12T21:41:00+01:00', creneau: 'nuit' }, maintenant),
    ).toBe('nuit');
    expect(
      momentDeLivraison({ cree_le: '2026-11-11T09:10:00+01:00', creneau: 'jour' }, maintenant),
    ).toBe('jour');
  });
});
