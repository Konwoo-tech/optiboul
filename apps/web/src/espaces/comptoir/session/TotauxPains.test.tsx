import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { TotauxPains } from './TotauxPains.tsx';

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

describe('Pains de la session', () => {
  it('lit les totaux de la caisse et range le GC135 sous « GC 135 »', async () => {
    let caisse: string | null = null;
    serveur.use(
      http.get('*/api/v1/mouvements-internes/totaux/', ({ request }) => {
        caisse = new URL(request.url).searchParams.get('caisse');
        return HttpResponse.json({
          caisse: 2,
          livres: { BAG: 120, KO: 30, GC135: 12 },
          vente_guichet: { BAG: 10 },
          retours: { KO: 2 },
          reste_en_salle: {},
          ration: { GC135: 1 },
        });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TotauxPains caisse="2" signature="1-1" />
      </QueryClientProvider>,
    );
    const tableau = await screen.findByRole('table');
    expect(caisse).toBe('2');
    const lignes = within(tableau).getAllByRole('row');
    const cellules = (rang: number) =>
      within(lignes[rang]!)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    expect(cellules(1)).toEqual(['120', '30', '12']);
    expect(cellules(2)).toEqual(['10', '0', '0']);
    expect(cellules(3)).toEqual(['0', '2', '0']);
    expect(cellules(5)).toEqual(['0', '0', '1']);
  });
});
