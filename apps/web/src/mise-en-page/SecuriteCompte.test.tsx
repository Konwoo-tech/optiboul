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

async function ouvrir() {
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
});
