import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranRapports from './EcranRapports.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());
afterEach(() => {
  cleanup();
  serveur.resetHandlers();
  vi.restoreAllMocks();
});

const SEMAINES = [
  { id: 1, numero: 48, code: 'S48', du: '2026-11-23', au: '2026-11-29' },
  { id: 2, numero: 49, code: 'S49', du: '2026-11-30', au: '2026-12-06' },
];

function ouvrir() {
  initI18n('fr');
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: 3,
        name: 'Willy',
        email: 'x@optiboul.local',
        url: 'http://localhost/api/v1/users/3/',
        profil: 'gerant',
      }),
    ),
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json({ count: 2, next: null, previous: null, results: SEMAINES }),
    ),
  );
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'rapports')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <EcranRapports ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

describe('Gestion › Rapports', () => {
  it('ouvre le rapport de semaine choisi, au format demandé', async () => {
    const ouvrirFenetre = vi.spyOn(window, 'open').mockReturnValue(null);
    ouvrir();
    const carte = await screen.findByRole('region', { name: 'Rapport de semaine' });
    await screen.findAllByRole('option', { name: 'Semaine 49' });
    const formats = carte.querySelectorAll('select');
    fireEvent.change(formats[1]!, { target: { value: 'excel' } });
    fireEvent.click(carte.querySelector('button')!);
    expect(String(ouvrirFenetre.mock.calls[0]?.[0])).toMatch(
      /rapports\/semaine\/\?semaine=2&format_fichier=excel/,
    );
  });

  it('ouvre le rapport de session du jour et du créneau choisis', async () => {
    const ouvrirFenetre = vi.spyOn(window, 'open').mockReturnValue(null);
    ouvrir();
    const carte = await screen.findByRole('region', { name: 'Rapport de session' });
    fireEvent.change(carte.querySelector('input[type=date]')!, {
      target: { value: '2026-11-25' },
    });
    fireEvent.click(carte.querySelector('button')!);
    const adresse = String(ouvrirFenetre.mock.calls[0]?.[0]);
    expect(adresse).toContain('/rapports/session/');
    expect(adresse).toContain('jour=2026-11-25');
    expect(adresse).toContain('creneau=nuit');
  });

  it('rapproche une semaine d’un fichier : les écarts sont listés', async () => {
    serveur.use(
      http.post('*/api/v1/rapports/rapprochement/', () =>
        HttpResponse.json({
          identique: false,
          ecarts: [
            {
              jour: '2026-11-24',
              creneau: 'nuit',
              application: { ventes: 100, recette: 5000 },
              excel: { ventes: 90, recette: 4500 },
            },
          ],
        }),
      ),
    );
    ouvrir();
    const carte = await screen.findByRole('region', { name: /Rapprochement/ });
    await screen.findAllByRole('option', { name: 'Semaine 49' });
    const fichier = new File(['jour,creneau,ventes,recette\n'], 'semaine.csv', {
      type: 'text/csv',
    });
    fireEvent.change(carte.querySelector('input[type=file]')!, { target: { files: [fichier] } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));
    expect(await screen.findByText(/1 écart relevé/)).toBeTruthy();
    expect(screen.getByText(/2026-11-24 · .*application : 100 · 5.000/)).toBeTruthy();
  });
});
