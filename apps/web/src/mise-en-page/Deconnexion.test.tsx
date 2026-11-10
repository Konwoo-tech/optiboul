import { configurerApi } from '@/api';
import { lireMessageConnexion } from '@/auth';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { BoutonDeconnexion, OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MiseEnPage } from './MiseEnPage.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  serveur.resetHandlers();
  vi.useRealTimers();
  window.sessionStorage.clear();
});
afterAll(() => serveur.close());

function ouvrirAvec(contenu: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>{contenu}</MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  return client;
}

describe('fermeture de la session sur le vrai serveur', () => {
  let appels: string[];
  beforeEach(() => {
    appels = [];
    serveur.use(
      http.post('*/api/v1/connexion/deconnexion/', () => {
        appels.push('deconnexion');
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/connexion/changer-utilisateur/', () => {
        appels.push('changer-utilisateur');
        return new HttpResponse(null, { status: 204 });
      }),
    );
  });

  it('« Changer d’utilisateur » appelle la route qui garde le poste et les brouillons', async () => {
    ouvrirAvec(<BoutonDeconnexion action="changer" libelle="Changer d’utilisateur" />);
    fireEvent.click(screen.getByRole('button', { name: 'Changer d’utilisateur' }));
    await waitFor(() => expect(appels).toEqual(['changer-utilisateur']));
  });

  it('la déconnexion simple appelle la route de déconnexion', async () => {
    ouvrirAvec(<BoutonDeconnexion />);
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(appels).toEqual(['deconnexion']));
  });

  it('un double clic n’envoie qu’une fermeture', async () => {
    ouvrirAvec(<BoutonDeconnexion libelle="Fermer" />);
    const bouton = screen.getByRole('button', { name: 'Fermer' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await waitFor(() => expect(appels).toHaveLength(1));
  });

  it('remet tout à zéro après la fermeture : la personne suivante ne voit rien de la précédente', async () => {
    const client = ouvrirAvec(<BoutonDeconnexion libelle="Fermer" />);
    client.setQueryData(['donnee-privee'], 'Davy');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(appels).toEqual(['deconnexion']));
    await waitFor(() => expect(client.getQueryData(['donnee-privee'])).toBeUndefined());
  });

  it('dit que le serveur ne répond pas quand la fermeture échoue', async () => {
    serveur.use(http.post('*/api/v1/connexion/deconnexion/', () => HttpResponse.error()));
    ouvrirAvec(<BoutonDeconnexion libelle="Fermer" />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(await screen.findByText(/Le serveur ne répond pas/)).toBeTruthy();
  });
});

describe('déconnexion automatique sur le vrai serveur', () => {
  function servir(inactiviteMinutes: number | null) {
    const appels: string[] = [];
    serveur.use(
      http.get('*/api/v1/connexion/session/', () =>
        HttpResponse.json({ via: inactiviteMinutes ? 'code' : 'e-mail', inactiviteMinutes }),
      ),
      http.post('*/api/v1/connexion/deconnexion/', () => {
        appels.push('deconnexion');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return appels;
  }

  it('ferme la session après le délai donné par le serveur, et le dit à la connexion suivante', async () => {
    const appels = servir(1);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    ouvrirAvec(<MiseEnPage />);
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80_000);
    });
    vi.useRealTimers();
    await waitFor(() => expect(appels).toEqual(['deconnexion']));
    expect(lireMessageConnexion()).toMatch(/Déconnexion automatique après 1 min/);
  });

  it('ne ferme rien pour une connexion sans minuteur (e-mail, Google)', async () => {
    const appels = servir(null);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    ouvrirAvec(<MiseEnPage />);
    await vi.advanceTimersByTimeAsync(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
    });
    vi.useRealTimers();
    expect(appels).toEqual([]);
  });
});
