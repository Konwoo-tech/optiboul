import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SecuriteCompte } from './SecuriteCompte.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

async function ouvrir(profil = 'caissier') {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({ url: 'http://localhost/api/v1/users/1/', name: 'Dev', profil }),
    ),
  );
  await initI18n('fr').changeLanguage('fr');
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SecuriteCompte libelle="Sécurité du compte" />
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sécurité du compte' }));
}

describe('sécurité du compte (MFA)', () => {
  it('active l’application : clé, code à 6 chiffres, puis codes de secours montrés une fois', async () => {
    let actif = false;
    const recus: unknown[] = [];
    serveur.use(
      http.get('*/api/v1/mfa/', () =>
        HttpResponse.json({ totp: actif, codesSecoursRestants: actif ? 10 : 0 }),
      ),
      http.post('*/api/v1/mfa/totp/preparer/', () =>
        HttpResponse.json({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/OptiBoul' }),
      ),
      http.post('*/api/v1/mfa/totp/activer/', async ({ request }) => {
        const corps = (await request.json()) as { code: string };
        recus.push(corps);
        if (corps.code !== '123456') {
          return HttpResponse.json(
            { detail: 'Code incorrect.', code: 'code_incorrect' },
            { status: 400 },
          );
        }
        actif = true;
        return HttpResponse.json({ codesSecours: ['11111111', '22222222'] });
      }),
    );
    await ouvrir();
    expect(await screen.findByText(/non activée/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Activer l’application d’authentification' }),
    );
    expect(await screen.findByLabelText('Clé de configuration')).toHaveProperty(
      'textContent',
      'JBSW Y3DP EHPK 3PXP',
    );
    const champ = screen.getByLabelText('Code à 6 chiffres');
    fireEvent.change(champ, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et activer' }));
    expect(await screen.findByText('Le code comporte 6 chiffres.')).toBeTruthy();
    fireEvent.change(champ, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et activer' }));
    expect(await screen.findByText(/Code incorrect/)).toBeTruthy();
    fireEvent.change(champ, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et activer' }));
    expect(await screen.findByText('11111111 · 22222222')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/activée · 10 code/)).toBeTruthy());
    expect(recus).toEqual([{ code: '000000' }, { code: '123456' }]);
  });

  it('régénère les codes de secours puis désactive l’application', async () => {
    let actif = true;
    serveur.use(
      http.get('*/api/v1/mfa/', () =>
        HttpResponse.json({ totp: actif, codesSecoursRestants: actif ? 3 : 0 }),
      ),
      http.post('*/api/v1/mfa/codes-secours/', () =>
        HttpResponse.json({ codesSecours: ['AAAA0000'] }),
      ),
      http.post('*/api/v1/mfa/totp/desactiver/', () => {
        actif = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await ouvrir();
    expect(await screen.findByText(/activée · 3 code/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer les codes de secours' }));
    expect(await screen.findByText('AAAA0000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    expect(await screen.findByText(/non activée/)).toBeTruthy();
  });

  it('un caissier ne voit pas les postes de confiance', async () => {
    serveur.use(
      http.get('*/api/v1/mfa/', () => HttpResponse.json({ totp: false, codesSecoursRestants: 0 })),
    );
    await ouvrir();
    expect(await screen.findByText(/non activée/)).toBeTruthy();
    expect(screen.queryByText('Postes de confiance')).toBeNull();
  });

  it('l’administrateur liste, enregistre et révoque un poste', async () => {
    const poste = (id: number, nom: string, actif: boolean) => ({
      id,
      nom,
      actif,
      cree_le: '2026-11-01T08:00:00Z',
      cree_par: 'Admin Dev',
      revoque_le: actif ? null : '2026-11-10T08:00:00Z',
      dernier_usage: actif ? '2026-11-19T07:00:00Z' : null,
    });
    let postes = [poste(1, 'PC du comptoir', true), poste(2, 'Ancien PC', false)];
    const recus: unknown[] = [];
    serveur.use(
      http.get('*/api/v1/mfa/', () => HttpResponse.json({ totp: false, codesSecoursRestants: 0 })),
      http.get('*/api/v1/postes/actuel/', () => HttpResponse.json({ poste: postes[0] })),
      http.get('*/api/v1/postes/', () =>
        HttpResponse.json({ count: postes.length, next: null, previous: null, results: postes }),
      ),
      http.post('*/api/v1/postes/', async ({ request }) => {
        const corps = (await request.json()) as { nom: string };
        recus.push(corps);
        postes = [...postes, poste(3, corps.nom, true)];
        return HttpResponse.json(postes[2], { status: 201 });
      }),
      http.post('*/api/v1/postes/1/revoquer/', () => {
        postes = [poste(1, 'PC du comptoir', false), postes[1]!, ...postes.slice(2)];
        return HttpResponse.json(postes[0]);
      }),
    );
    await ouvrir('administrateur');
    expect(await screen.findByText('PC du comptoir')).toBeTruthy();
    expect(screen.getByText(/· ce navigateur/)).toBeTruthy();
    expect(screen.getByText(/Révoqué le/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ce navigateur' }));
    expect(await screen.findByText('Indiquez un nom pour le poste.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nom du poste'), { target: { value: 'Tablette' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ce navigateur' }));
    expect(await screen.findByText('Tablette')).toBeTruthy();
    expect(recus).toEqual([{ nom: 'Tablette' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer PC du comptoir' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmer la révocation de PC du comptoir' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Révoquer PC du comptoir' })).toBeNull(),
    );
  });

  it('refuse l’enregistrement depuis l’accès distant', async () => {
    serveur.use(
      http.get('*/api/v1/mfa/', () => HttpResponse.json({ totp: false, codesSecoursRestants: 0 })),
      http.get('*/api/v1/postes/actuel/', () => HttpResponse.json({ poste: null })),
      http.get('*/api/v1/postes/', () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
      http.post('*/api/v1/postes/', () =>
        HttpResponse.json(
          { detail: 'Un poste de confiance s’enregistre depuis la boulangerie.' },
          { status: 403 },
        ),
      ),
    );
    await ouvrir('administrateur');
    fireEvent.change(await screen.findByLabelText('Nom du poste'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ce navigateur' }));
    expect(
      await screen.findByText('Un poste de confiance s’enregistre depuis la boulangerie.'),
    ).toBeTruthy();
  });
});
