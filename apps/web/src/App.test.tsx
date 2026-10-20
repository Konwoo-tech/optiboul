import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function connecte(profil: string | null) {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({ url: 'http://localhost/api/v1/users/1/', name: 'Davy', profil }),
    ),
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
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeTruthy();
  });

  it('la caissière arrive sur sa caisse, sans les autres espaces', async () => {
    connecte('caissier');
    ouvrir('/');
    expect(await screen.findByRole('heading', { name: 'Ma caisse' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Gestion' })).toBeNull();
  });

  it("un espace interdit renvoie à l'accueil du profil", async () => {
    connecte('production');
    ouvrir('/gestion');
    expect(await screen.findByRole('heading', { name: 'Plan du jour' })).toBeTruthy();
  });

  it('le gérant arrive sur Ma semaine et voit ses trois espaces', async () => {
    connecte('gerant');
    ouvrir('/');
    expect(await screen.findByRole('heading', { name: 'Ma semaine' })).toBeTruthy();
    for (const espace of ['Gestion', 'Comptoir', 'Atelier']) {
      expect(screen.getByRole('tab', { name: espace })).toBeTruthy();
    }
  });

  it('un compte sans groupe est invité à contacter l’administrateur', async () => {
    connecte(null);
    ouvrir('/');
    expect(await screen.findByText(/aucun groupe/)).toBeTruthy();
  });
});
