import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ImportClasseur } from './ImportClasseur.tsx';

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

const rapport = (simulation: boolean) => ({
  simulation,
  clients: 11,
  tarifs: 22,
  soldes: 7,
  rejets: [{ feuille: 'Clients', ligne: 4, raison: 'Téléphone invalide' }],
  dettes_au_dela_du_plafond: [{ client: 'Ebène', dette: 3400, plafond: 2000 }],
});

describe('Reprise du classeur de clients', () => {
  it('simule d’abord, puis confirme : rien n’est gardé avant la confirmation', async () => {
    const envois: string[] = [];
    serveur.use(
      http.post('*/api/v1/clients/importer/', () => {
        // Le premier envoi est la simulation, le second la confirmation (le corps est un multipart).
        const confirmer = envois.length === 1;
        envois.push(confirmer ? 'confirmer' : 'simuler');
        return HttpResponse.json(rapport(!confirmer));
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportClasseur />
      </QueryClientProvider>,
    );
    const confirmer = screen.getByRole('button', {
      name: 'Confirmer l’import',
    }) as HTMLButtonElement;
    expect(confirmer.disabled).toBe(true);

    const fichier = new File(['x'], 'classeur.xlsx');
    fireEvent.change(screen.getByLabelText('Classeur Excel (.xlsx)'), {
      target: { files: [fichier] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simuler l’import' }));
    expect(await screen.findByText(/Simulation : 11 clients, 22 tarifs et 7 soldes/)).toBeTruthy();
    expect(screen.getByText('Clients, ligne 4 : Téléphone invalide')).toBeTruthy();
    expect(screen.getByText('1 dette dépasse le plafond.')).toBeTruthy();

    fireEvent.click(confirmer);
    expect(await screen.findByText(/Import fait : 11 clients/)).toBeTruthy();
    expect(envois).toEqual(['simuler', 'confirmer']);
    expect(confirmer.disabled).toBe(true);
  });
});
