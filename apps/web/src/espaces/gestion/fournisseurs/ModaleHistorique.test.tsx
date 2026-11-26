import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ModaleHistorique } from './ModaleHistorique.tsx';
import type { Facture } from './types.ts';

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

const facture: Facture = {
  numero: 'FAC-41',
  fournisseur: '1',
  objet: { genre: 'farine', semaine: '2026-S47', sacs: 10 } as never,
  montant: 90000,
  echeance: '2026-11-30',
  statut: 'payee',
  enRetard: false,
  semaine: '2026-S47',
  idServeur: 41,
};

describe('Historique des paiements d’une facture', () => {
  it('liste les paiements du plus récent au plus ancien et ouvre le reçu choisi', async () => {
    serveur.use(
      http.get('*/api/v1/factures/41/paiements/', () =>
        HttpResponse.json([
          {
            id: 7,
            facture: 41,
            montant: 40000,
            mode: 'especes',
            reference: '',
            depense: 3,
            paye_par: 'Gérant',
            paye_le: '2026-11-20T09:00:00Z',
          },
          {
            id: 9,
            facture: 41,
            montant: 50000,
            mode: 'mobile',
            reference: 'MP-123',
            depense: 4,
            paye_par: 'Gérant',
            paye_le: '2026-11-25T09:00:00Z',
          },
        ]),
      ),
    );
    const ouvrir = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ModaleHistorique facture={facture} onFermer={() => {}} />
      </QueryClientProvider>,
    );
    const liste = await screen.findByRole('list', { name: 'Paiements de la facture' });
    const lignes = within(liste).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]?.textContent).toContain('MP-123');
    expect(lignes[1]?.textContent).toContain('40');
    fireEvent.click(within(lignes[1]!).getByRole('button'));
    expect(String(ouvrir.mock.calls[0]?.[0])).toContain('/paiements-fournisseurs/7/recu/');
  });
});
