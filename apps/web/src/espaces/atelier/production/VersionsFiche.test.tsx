import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { VersionsFiche } from './VersionsFiche.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n('fr');
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());
afterEach(() => {
  cleanup();
  serveur.resetHandlers();
});

const version = (numero: number, pains: number, jour: string) => ({
  version: numero,
  poids_boule: 5000,
  pains_par_boule: 1,
  pains_par_sac: pains,
  boules_par_sac: '63',
  procede: '',
  recette: {},
  cout: null,
  cree_par_nom: 'Propriétaire',
  cree_le: `${jour}T10:00:00Z`,
});

describe('Versions de la fiche technique', () => {
  it('liste les versions de la plus récente à la plus ancienne', async () => {
    serveur.use(
      http.get('*/api/v1/produits/3/fiches/', () =>
        // Le serveur renvoie un tableau simple, pas une page.
        HttpResponse.json([version(1, 300, '2026-10-01'), version(2, 315, '2026-11-12')]),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <VersionsFiche idServeur={3} version={2} />
      </QueryClientProvider>,
    );
    const lignes = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]?.textContent).toContain('v2');
    expect(lignes[0]?.textContent).toContain('315 pains par sac');
    expect(lignes[1]?.textContent).toContain('v1');
  });

  it('ne montre rien sans produit du serveur', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <VersionsFiche idServeur={undefined} version={1} />
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
