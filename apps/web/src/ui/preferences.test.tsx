import { configurerApi } from '@/api';
import { changerLangue, initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BasculeApparence } from './BasculeApparence.tsx';
import { OptiboulProvider } from './OptiboulProvider.tsx';
import {
  THEME_DU_SERVEUR,
  useAppliquerPreferences,
  useEnregistrerPreferences,
} from './preferences.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(async () => {
  personneLue = false;
  serveur.resetHandlers();
  await changerLangue('fr');
  localStorage.clear();
});
afterAll(() => serveur.close());

let personneLue = false;
const moi = (preferences: Record<string, string>) =>
  http.get('*/api/v1/users/me/', () => {
    personneLue = true;
    return HttpResponse.json({
      id: 7,
      name: 'Davy Caisse',
      email: 'davy@optiboul.local',
      url: 'http://localhost/api/v1/users/7/',
      profil: 'caissier',
      theme: 'auto',
      langue: 'fr',
      ...preferences,
    });
  });

function Page() {
  useAppliquerPreferences();
  const enregistrer = useEnregistrerPreferences();
  return (
    <BasculeApparence
      onChoix={(choix) =>
        enregistrer('langue' in choix ? choix : { theme: THEME_DU_SERVEUR[choix.theme] })
      }
    />
  );
}

const ouvrir = () =>
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Page />
      </QueryClientProvider>
    </OptiboulProvider>,
  );

const schema = () => document.documentElement.getAttribute('data-mantine-color-scheme');

describe('thème et langue par personne', () => {
  it('à la connexion, applique le thème sombre et la langue anglaise de la personne', async () => {
    serveur.use(moi({ theme: 'sombre', langue: 'en' }));
    ouvrir();
    await waitFor(() => expect(schema()).toBe('dark'));
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });

  it('une personne qui préfère le clair l’obtient même si le navigateur avait gardé le sombre', async () => {
    localStorage.setItem('mantine-color-scheme-value', 'dark');
    serveur.use(moi({ theme: 'clair', langue: 'fr' }));
    ouvrir();
    await waitFor(() => expect(schema()).toBe('light'));
  });

  it('à chaque bascule, enregistre la préférence (PATCH /users/me/)', async () => {
    const corps: unknown[] = [];
    serveur.use(
      moi({}),
      http.patch('*/api/v1/users/me/', async ({ request }) => {
        corps.push(await request.json());
        return HttpResponse.json({ id: 7 });
      }),
    );
    ouvrir();
    // Attend que la personne soit connue (réponse reçue et rendue) avant de basculer.
    await waitFor(() => expect(personneLue).toBe(true));
    await new Promise((resoudre) => setTimeout(resoudre, 300));
    fireEvent.click(screen.getByRole('button', { name: 'Sombre' }));
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    // Deux requêtes concurrentes : l'ordre d'arrivée n'est pas garanti.
    await waitFor(() => expect(corps).toHaveLength(2));
    expect(corps).toEqual(expect.arrayContaining([{ theme: 'sombre' }, { langue: 'en' }]));
  });

  it('sans session, rien n’est envoyé au serveur', async () => {
    serveur.use(
      http.get('*/api/v1/users/me/', () =>
        HttpResponse.json({ detail: 'x', code: 'non_authentifie' }, { status: 401 }),
      ),
    );
    ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Sombre' }));
    // Aucun PATCH déclaré : `onUnhandledFrame: 'error'` ferait échouer le test s'il partait.
    await new Promise((resoudre) => setTimeout(resoudre, 150));
    expect(schema()).toBe('dark');
  });
});
