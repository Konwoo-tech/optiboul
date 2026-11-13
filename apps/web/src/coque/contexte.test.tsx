import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useContexte } from './contexte.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
const SEMAINE = {
  id: 7,
  code: '2026-S46',
  annee: 2026,
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant' },
  production: { id: 5, nom: 'Serge Production' },
  ouverte_le: '2026-11-09T06:00:00+01:00',
};
const CAISSE = {
  ouverte_le: '2026-11-10T17:02:00+01:00',
  caissiere: { id: 4, nom: 'Davy Caisse' },
};

function connecte() {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        url: 'http://localhost/api/v1/users/3/',
        name: 'Willy',
        profil: 'gerant',
      }),
    ),
  );
}

function servir(options: {
  semaines?: unknown[];
  prochaine?: JsonBodyType | 'refuse';
  poste?: boolean;
}) {
  serveur.use(
    http.get('*/api/v1/semaines/', ({ request }) => {
      expect(new URL(request.url).searchParams.get('statut')).toBe('ouverte');
      return HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: options.semaines ?? [],
      });
    }),
    http.get('*/api/v1/caisses/prochaine/', () =>
      options.prochaine === 'refuse'
        ? HttpResponse.json({ detail: 'Droits insuffisants.' }, { status: 403 })
        : HttpResponse.json(options.prochaine),
    ),
    http.get('*/api/v1/postes/actuel/', () =>
      options.poste
        ? HttpResponse.json({ poste: { id: 1, nom: 'PC du comptoir' } })
        : HttpResponse.json({ detail: 'Poste non reconnu.' }, { status: 403 }),
    ),
  );
}

function Lecteur() {
  const { data } = useContexte();
  return <pre data-testid="contexte">{JSON.stringify(data ?? null)}</pre>;
}

async function lire() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Lecteur />
    </QueryClientProvider>,
  );
  return client;
}

const contexteAffiche = () => JSON.parse(screen.getByTestId('contexte').textContent ?? 'null');

describe('contexte de la coque sur le vrai serveur', () => {
  it('compose la semaine ouverte, la session en cours et le poste', async () => {
    connecte();
    servir({
      semaines: [SEMAINE],
      prochaine: {
        jour: '2026-11-10',
        creneau: 'nuit',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: CAISSE,
      },
      poste: true,
    });
    await lire();
    await waitFor(() => expect(contexteAffiche()).not.toBeNull());
    expect(contexteAffiche()).toEqual({
      poste: 'PC du comptoir',
      gerantDeLaSemaine: 'Willy Gérant',
      responsableProduction: 'Serge Production',
      caissierDeSession: 'Davy Caisse',
      semaine: { numero: 46, du: '2026-11-09', au: '2026-11-15' },
      sessionOuverteDepuis: '17:02',
      sessionType: 'nuit',
      sessionOuverte: true,
    });
  });

  it('sans caisse en cours, la session est fermée et le créneau est celui à ouvrir', async () => {
    connecte();
    servir({
      semaines: [SEMAINE],
      prochaine: {
        jour: '2026-11-10',
        creneau: 'jour',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: null,
      },
    });
    await lire();
    await waitFor(() => expect(contexteAffiche()).not.toBeNull());
    expect(contexteAffiche()).toMatchObject({
      sessionOuverte: false,
      sessionType: 'jour',
      caissierDeSession: '',
      sessionOuverteDepuis: '',
      poste: '',
    });
  });

  it('un profil qui n’a pas le droit de lire les caisses garde la semaine', async () => {
    connecte();
    servir({ semaines: [SEMAINE], prochaine: 'refuse' });
    await lire();
    await waitFor(() => expect(contexteAffiche()).not.toBeNull());
    expect(contexteAffiche()).toMatchObject({
      semaine: { numero: 46, du: '2026-11-09', au: '2026-11-15' },
      gerantDeLaSemaine: 'Willy Gérant',
      sessionOuverte: false,
    });
  });

  it('sans semaine ouverte, il n’y a pas de contexte à montrer', async () => {
    connecte();
    let lectures = 0;
    servir({ semaines: [], prochaine: 'refuse' });
    serveur.events.on('response:mocked', () => {
      lectures += 1;
    });
    const client = await lire();
    await waitFor(() => expect(lectures).toBeGreaterThanOrEqual(4));
    expect(contexteAffiche()).toBeNull();
    // Ce n'est pas une erreur de la requête (TanStack refuse une réponse `undefined`).
    await waitFor(() => {
      const etats = client
        .getQueryCache()
        .findAll({ queryKey: ['coque', 'contexte'] })
        .map((requete) => requete.state.status);
      expect(etats).toContain('success');
      expect(etats).not.toContain('error');
    });
  });

  it('avant la connexion, rien n’est demandé au serveur', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => new HttpResponse(null, { status: 403 })));
    let demandes = 0;
    serveur.events.on('request:start', ({ request }) => {
      if (/semaines|caisses|postes/.test(request.url)) demandes += 1;
    });
    await lire();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(demandes).toBe(0);
    expect(contexteAffiche()).toBeNull();
  });
});
