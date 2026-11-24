import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import ChoixMotDePasse from './ChoixMotDePasse.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

async function ouvrir(mode: 'invitation' | 'reinitialisation', recherche: string) {
  await initI18n('fr').changeLanguage('fr');
  serveur.use(
    http.get('*/api/v1/connexion/utilisateurs/', () =>
      HttpResponse.json({ code: 'poste_non_reconnu' }, { status: 403 }),
    ),
    http.get('*/api/v1/postes/actuel/', () => HttpResponse.json({ poste: null, contexte: null })),
  );
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[`/connexion/x${recherche}`]}>
          <ChoixMotDePasse mode={mode} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

const saisir = (motDePasse: string, confirmation: string) => {
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: motDePasse } });
  fireEvent.change(screen.getByLabelText('Confirmez le mot de passe'), {
    target: { value: confirmation },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
};

describe('choisir son mot de passe depuis le lien reçu par e-mail', () => {
  it('invitation : envoie uid, jeton et mot de passe, puis propose de se connecter', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/connexion/invitation/', async ({ request }) => {
        corps = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await ouvrir('invitation', '?uid=Mw&jeton=abc-123');
    expect(await screen.findByText('Bienvenue sur OptiBoul')).toBeTruthy();
    saisir('MotDePasse-2026', 'MotDePasse-2026');
    expect(await screen.findByText(/Votre mot de passe est enregistré/)).toBeTruthy();
    expect(corps).toEqual({ uid: 'Mw', jeton: 'abc-123', motDePasse: 'MotDePasse-2026' });
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeTruthy();
  });

  it('mot de passe oublié : envoie le jeton et le mot de passe', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/connexion/nouveau-mot-de-passe/', async ({ request }) => {
        corps = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await ouvrir('reinitialisation', '?jeton=zzz');
    expect(await screen.findByText('Nouveau mot de passe')).toBeTruthy();
    saisir('AutreMotDePasse-9', 'AutreMotDePasse-9');
    expect(await screen.findByText(/Votre mot de passe est enregistré/)).toBeTruthy();
    expect(corps).toEqual({ jeton: 'zzz', motDePasse: 'AutreMotDePasse-9' });
  });

  it('refuse un mot de passe trop court ou une confirmation différente, sans appeler le serveur', async () => {
    await ouvrir('reinitialisation', '?jeton=zzz');
    await screen.findByText('Nouveau mot de passe');
    saisir('court', 'court');
    expect(await screen.findByText('Le mot de passe comporte au moins 8 caractères.')).toBeTruthy();
    saisir('MotDePasse-2026', 'Autre-2026-xyz');
    expect(await screen.findByText('Les deux mots de passe ne sont pas identiques.')).toBeTruthy();
  });

  it('affiche la raison donnée par le serveur pour un mot de passe trop faible', async () => {
    serveur.use(
      http.post('*/api/v1/connexion/nouveau-mot-de-passe/', () =>
        HttpResponse.json(
          { detail: 'Ce mot de passe est trop courant.', code: 'mot_de_passe_faible' },
          { status: 400 },
        ),
      ),
    );
    await ouvrir('reinitialisation', '?jeton=zzz');
    await screen.findByText('Nouveau mot de passe');
    saisir('password123', 'password123');
    expect(await screen.findByText('Ce mot de passe est trop courant.')).toBeTruthy();
  });

  it('un lien expiré ou incomplet donne un message clair', async () => {
    serveur.use(
      http.post('*/api/v1/connexion/invitation/', () =>
        HttpResponse.json(
          { detail: 'Lien d’invitation invalide ou expiré.', code: 'invitation_invalide' },
          { status: 400 },
        ),
      ),
    );
    await ouvrir('invitation', '?uid=Mw&jeton=vieux');
    await screen.findByText('Bienvenue sur OptiBoul');
    saisir('MotDePasse-2026', 'MotDePasse-2026');
    expect(await screen.findByText(/Ce lien est invalide ou expiré/)).toBeTruthy();
  });

  it('un lien de réinitialisation déjà utilisé donne le même message', async () => {
    serveur.use(
      http.post('*/api/v1/connexion/nouveau-mot-de-passe/', () =>
        HttpResponse.json(
          { detail: 'Lien invalide, expiré ou déjà utilisé.', code: 'lien_invalide' },
          { status: 400 },
        ),
      ),
    );
    await ouvrir('reinitialisation', '?jeton=utilise');
    await screen.findByText('Nouveau mot de passe');
    saisir('MotDePasse-2026', 'MotDePasse-2026');
    expect(await screen.findByText(/Ce lien est invalide ou expiré/)).toBeTruthy();
  });

  it('sans jeton dans le lien, aucun formulaire', async () => {
    await ouvrir('invitation', '');
    expect(await screen.findByText(/Ce lien est invalide ou expiré/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer le mot de passe' })).toBeNull();
  });
});
