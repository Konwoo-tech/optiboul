import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import EcransReels from './EcransReels.tsx';

// Les formes de réponse sont celles du vrai serveur (apps/api, schema.yml).
const PERSONNES = [
  { id: 4, nom: 'Davy Caisse', profil: 'caissier' },
  { id: 3, nom: 'Willy Gérant', profil: 'gerant' },
];

const serveur = creerServeurApi();
const surMessage = vi.fn();

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());
beforeEach(() => surMessage.mockReset());

function ouvrir(chemin = '/connexion') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[chemin]}>
          <EcransReels onMessage={surMessage} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

async function saisir(code: string) {
  for (const chiffre of code) fireEvent.click(await screen.findByRole('button', { name: chiffre }));
}

describe('connexion sur le vrai serveur', () => {
  it('sur un poste de confiance, propose les personnes du poste, sans aucune aide de démonstration', async () => {
    serveur.use(http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)));
    ouvrir();
    expect(await screen.findByRole('button', { name: /Davy Caisse/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Willy Gérant/ })).toBeTruthy();
    expect(screen.queryByText(/démonstration/i)).toBeNull();
  });

  it('hors poste de confiance, propose l’adresse e-mail, sans Google ni compte de démonstration', async () => {
    ouvrir();
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continuer avec Google' })).toBeNull();
    expect(screen.queryByText('Profils de démonstration')).toBeNull();
  });

  it('avec ?mode=email, propose l’adresse e-mail même sur un poste de confiance', async () => {
    serveur.use(http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)));
    ouvrir('/connexion?mode=email');
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Davy Caisse/ })).toBeNull();
  });

  it('envoie l’identifiant numérique et le code, puis efface le message', async () => {
    let corps: unknown;
    serveur.use(
      http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)),
      http.post('*/api/v1/connexion/code/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ deuxFacteurs: false });
      }),
    );
    ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: /Davy Caisse/ }));
    await saisir('4444');
    await waitFor(() => expect(corps).toEqual({ utilisateur: 4, code: '4444' }));
    await waitFor(() => expect(surMessage).toHaveBeenCalledWith(''));
  });

  it('dit qu’un code est incorrect', async () => {
    serveur.use(
      http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)),
      http.post('*/api/v1/connexion/code/', () =>
        HttpResponse.json(
          { detail: 'Code incorrect.', code: 'code_incorrect', essaisRestants: 4 },
          { status: 400 },
        ),
      ),
    );
    ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: /Davy Caisse/ }));
    await saisir('0000');
    expect(await screen.findByText(/incorrect/i)).toBeTruthy();
  });

  it('enchaîne sur le deuxième facteur : envoi par SMS puis vérification du code', async () => {
    const appels: string[] = [];
    serveur.use(
      http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)),
      http.post('*/api/v1/connexion/code/', () =>
        HttpResponse.json({
          deuxFacteurs: true,
          utilisateur: {
            id: 3,
            nom: 'Willy Gérant',
            profil: 'gerant',
            email: 'gerant@optiboul.local',
          },
          telephoneMasque: '+237 6 •• •• 00 03',
          canal: 'sms',
          via: 'code',
          applicationAuthentification: false,
        }),
      ),
      http.post('*/api/v1/connexion/otp/envoyer/', async ({ request }) => {
        appels.push(`envoyer ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({
          heure: '23:50',
          canal: 'sms',
          telephoneMasque: '+237 6 •• •• 00 03',
          renvoiDans: 30,
        });
      }),
      http.post('*/api/v1/connexion/otp/verifier/', async ({ request }) => {
        appels.push(`verifier ${JSON.stringify(await request.json())}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: /Willy Gérant/ }));
    await saisir('3333');
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le code par SMS' }));
    const champ = (await screen.findByLabelText('Code à 6 chiffres')) as HTMLInputElement;
    fireEvent.change(champ, { target: { value: '255300' } });
    await waitFor(() =>
      expect(appels).toEqual(['envoyer {"canal":"sms"}', 'verifier {"code":"255300"}']),
    );
  });

  it('annule l’identification côté serveur quand on revient en arrière', async () => {
    let annule = false;
    serveur.use(
      http.get('*/api/v1/connexion/utilisateurs/', () => HttpResponse.json(PERSONNES)),
      http.post('*/api/v1/connexion/code/', () =>
        HttpResponse.json({
          deuxFacteurs: true,
          utilisateur: {
            id: 3,
            nom: 'Willy Gérant',
            profil: 'gerant',
            email: 'gerant@optiboul.local',
          },
          telephoneMasque: '+237 6 •• •• 00 03',
          canal: 'sms',
          via: 'code',
          applicationAuthentification: false,
        }),
      ),
      http.post('*/api/v1/connexion/annuler/', () => {
        annule = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: /Willy Gérant/ }));
    await saisir('3333');
    fireEvent.click(await screen.findByRole('button', { name: /Retour/ }));
    await waitFor(() => expect(annule).toBe(true));
    expect(await screen.findByRole('button', { name: /Willy Gérant/ })).toBeTruthy();
  });
});
