import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { App } from './App.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const CAISSE = {
  id: 2,
  semaine: 1,
  jour: '2026-11-13',
  creneau: 'jour',
  caissiere: { id: 4, nom: 'Davy Caisse' },
  planifiee: null,
  hors_planning: false,
  fonds: 20000,
  attendu: null,
  compte: null,
  ecart: null,
  statut: 'ouverte',
  en_cours: true,
  ouverte_le: '2026-11-13T08:00:00+01:00',
  fermee_le: null,
};

function connecte(profil: string | null) {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({ url: 'http://localhost/api/v1/users/1/', name: 'Davy', profil }),
    ),
    // La coque et l'écran Session lisent le serveur : une caisse ouverte, rien d'autre.
    http.get('*/api/v1/connexion/session/', () =>
      HttpResponse.json({ detail: 'x' }, { status: 403 }),
    ),
    http.get('*/api/v1/postes/actuel/', () => HttpResponse.json({ detail: 'x' }, { status: 403 })),
    http.get('*/api/v1/semaines/', () => HttpResponse.json(page([]))),
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
      HttpResponse.json({ detail: 'x' }, { status: 403 }),
    ),
    http.get('*/api/v1/clients/', () => HttpResponse.json(page([]))),
    http.get('*/api/v1/commandes/', () => HttpResponse.json([])),
    http.get('*/api/v1/commandes/habituels-sans-commande/', () => HttpResponse.json([])),
    http.get('*/api/v1/livraisons/', () => HttpResponse.json(page([]))),
    http.get('*/api/v1/demandes/', () => HttpResponse.json(page([]))),
    http.get('*/api/v1/mouvements-internes/', () => HttpResponse.json(page([]))),
  );
}

function ouvrir(chemin: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[chemin]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

describe('application web', () => {
  it('sans session, affiche la connexion', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => new HttpResponse(null, { status: 403 })));
    ouvrir('/comptoir');
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('serveur en panne : la connexion s’affiche avec un bandeau et propose de réessayer', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => new HttpResponse(null, { status: 503 })));
    ouvrir('/comptoir');
    expect(await screen.findByText('Serveur injoignable', {}, { timeout: 4000 })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.getByText(/Le serveur ne répond pas. Réessayez dans un instant/)).toBeTruthy();
    expect(screen.queryByText(/Vous n’êtes pas déconnecté/)).toBeNull();
    connecte('caissier');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByRole('heading', { name: /^Session de (jour|nuit) du / }),
    ).toBeTruthy();
  });

  it('coupure réseau : même comportement, la page de connexion reste visible', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => HttpResponse.error()));
    ouvrir('/');
    expect(await screen.findByText('Serveur injoignable', {}, { timeout: 4000 })).toBeTruthy();
  });

  it('la caissière arrive sur sa caisse, sans les autres espaces', async () => {
    connecte('caissier');
    ouvrir('/');
    expect(
      await screen.findByRole('heading', { name: /^Session de (jour|nuit) du / }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Gestion' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Atelier' })).toBeNull();
  });

  it('la caissière retrouve clients, dépenses et demandes dans son menu', async () => {
    connecte('caissier');
    ouvrir('/');
    await screen.findByRole('heading', { name: /^Session de (jour|nuit) du / });
    for (const ecran of [
      'Session en cours',
      'Caisses',
      'Clients et dettes',
      'Dépenses',
      'Demandes',
    ]) {
      expect(screen.getByRole('link', { name: ecran })).toBeTruthy();
    }
    expect(screen.queryByRole('link', { name: 'Fournisseurs' })).toBeNull();
  });

  it('un écran que le profil ne voit pas renvoie à son accueil', async () => {
    connecte('caissier');
    ouvrir('/comptoir/fournisseurs');
    expect(
      await screen.findByRole('heading', { name: /^Session de (jour|nuit) du / }),
    ).toBeTruthy();
  });

  it("un espace interdit renvoie à l'accueil du profil", async () => {
    connecte('production');
    ouvrir('/gestion');
    expect(
      await screen.findByRole('heading', { name: /^Production · Session de (jour|nuit) / }),
    ).toBeTruthy();
  });

  it('le gérant arrive sur les semaines de travail et voit ses trois espaces', async () => {
    connecte('gerant');
    ouvrir('/');
    expect(await screen.findByRole('heading', { name: 'Semaines de travail' })).toBeTruthy();
    for (const espace of ['Gestion', 'Comptoir', 'Atelier']) {
      expect(screen.getByRole('link', { name: espace })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Fournisseurs' })).toBeTruthy();
  });

  it('le propriétaire arrive sur le tableau de bord', async () => {
    connecte('proprietaire');
    ouvrir('/');
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeTruthy();
  });

  it('l’administrateur arrive sur les utilisateurs et ne voit que la gestion', async () => {
    connecte('administrateur');
    ouvrir('/');
    expect(await screen.findByRole('heading', { name: 'Utilisateurs et rôles' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Comptoir' })).toBeNull();
  });

  it('un compte sans groupe est invité à contacter l’administrateur', async () => {
    connecte(null);
    ouvrir('/');
    expect(await screen.findByText(/aucun groupe/)).toBeTruthy();
  });
});
