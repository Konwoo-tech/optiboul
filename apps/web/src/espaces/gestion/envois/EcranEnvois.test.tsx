import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranEnvois from './EcranEnvois.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());
afterEach(() => {
  cleanup();
  serveur.resetHandlers();
});

const MESSAGES = [
  {
    id: 7,
    canal: 'whatsapp',
    destinataire: '+237 6 •• •• 10 45',
    sujet: 'Relance de dette',
    statut: 'echec',
    tentatives: 10,
    derniere_erreur: 'Numéro injoignable',
    cree_le: '2026-11-25T10:00:00+01:00',
    envoye_le: null,
  },
  {
    id: 6,
    canal: 'email',
    destinataire: 'recrue@optiboul.local',
    sujet: 'Invitation',
    statut: 'envoye',
    tentatives: 1,
    derniere_erreur: '',
    cree_le: '2026-11-25T09:00:00+01:00',
    envoye_le: '2026-11-25T09:01:00+01:00',
  },
];

function ouvrir(profil = 'gerant') {
  initI18n('fr');
  const appels: string[] = [];
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: 3,
        name: 'Willy',
        email: 'x@optiboul.local',
        url: 'http://localhost/api/v1/users/3/',
        profil,
      }),
    ),
    http.get('*/api/v1/envois/etat/', () =>
      HttpResponse.json({
        internet: 'en_ligne',
        en_attente: 0,
        en_echec: 1,
        plus_ancien_en_attente: null,
        derniere_tentative: null,
      }),
    ),
    http.get('*/api/v1/envois/', ({ request }) => {
      const statut = new URL(request.url).searchParams.get('statut');
      appels.push(`liste ${statut ?? 'tous'}`);
      const filtres = statut ? MESSAGES.filter((m) => m.statut === statut) : MESSAGES;
      return HttpResponse.json({
        count: filtres.length,
        next: null,
        previous: null,
        results: filtres,
      });
    }),
    http.post('*/api/v1/envois/:id/relancer/', ({ params }) => {
      appels.push(`relancer ${params.id}`);
      return HttpResponse.json({});
    }),
  );
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'envois')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <EcranEnvois ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  return appels;
}

describe('Gestion › Envois', () => {
  it('liste la file avec son état, filtre par statut et relance un envoi en échec', async () => {
    const appels = ouvrir();
    expect(await screen.findByText(/WhatsApp · \+237/)).toBeTruthy();
    expect(screen.getByText('Numéro injoignable')).toBeTruthy();
    expect(screen.getAllByText('En ligne').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Relancer l’envoi/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Envoyés' }));
    expect(await screen.findByText(/E-mail · recrue@optiboul.local/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Relancer l’envoi/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'En échec' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Relancer l’envoi/ }));
    expect(await screen.findByText('Envoi remis dans la file')).toBeTruthy();
    expect(appels).toContain('relancer 7');
    expect(appels).toContain('liste echec');
  });
});
