import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  COFFRE,
  lireCaisses,
  useCaisses,
  useFermerCaisse,
  useOuvrirCaisse,
  useRemettreAuCoffre,
  useRouvrirCaisse,
  versSessionDeCaisse,
} from './api.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
const DAVY = { id: 4, nom: 'Davy Caisse' };
const OUVERTE = {
  id: 2,
  semaine: 1,
  jour: '2026-11-13',
  creneau: 'jour',
  caissiere: DAVY,
  ouverte_par: DAVY,
  fermee_par: null,
  recette: 0,
  planifiee: null,
  hors_planning: true,
  fonds: 20000,
  attendu: null,
  compte: null,
  ecart: null,
  statut: 'ouverte',
  en_cours: true,
  ouverte_le: '2026-11-13T08:00:00+01:00',
  fermee_le: null,
};
const FERMEE = {
  ...OUVERTE,
  id: 1,
  jour: '2026-11-12',
  creneau: 'nuit',
  attendu: 21600,
  compte: 21000,
  ecart: -600,
  statut: 'fermee',
  en_cours: false,
  fermee_par: { id: 3, nom: 'Willy Gérant' },
  recette: 5600,
  ouverte_le: '2026-11-12T21:30:00+01:00',
  fermee_le: '2026-11-13T05:10:00+01:00',
};
const ESPECES = {
  fonds: 20000,
  especes: 1600,
  depenses: 0,
  remises: 0,
  attendu: 21600,
  plafond: 100000,
  remise_proposee: 0,
};

function serveurCaisses(options: { especesRefusees?: boolean } = {}) {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: 4,
        email: 'davy@gmail.com',
        url: 'http://localhost/api/v1/users/4/',
        name: 'Davy',
        profil: 'caissier',
      }),
    ),
    // La plus récente d'abord, comme le serveur.
    http.get('*/api/v1/caisses/', () =>
      HttpResponse.json({ count: 2, next: null, previous: null, results: [OUVERTE, FERMEE] }),
    ),
    http.get('*/api/v1/caisses/recapitulatif/', () =>
      HttpResponse.json([
        { caissiere: DAVY, ouvertures: 2, recette: 5600, ecart_cumule: -600, manques: 1 },
      ]),
    ),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({
        jour: '2026-11-13',
        creneau: 'nuit',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: OUVERTE,
      }),
    ),
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            numero: 46,
            du: '2026-11-09',
            au: '2026-11-15',
            statut: 'ouverte',
            gerant: { id: 3, nom: 'Willy Gérant' },
            production: null,
          },
        ],
      }),
    ),
    http.get('*/api/v1/caisses/2/especes/', () =>
      options.especesRefusees
        ? HttpResponse.json({ detail: 'non' }, { status: 403 })
        : HttpResponse.json(ESPECES),
    ),
  );
}

describe('lecture des caisses sur le vrai serveur', () => {
  it('compose liste, récapitulatif, prochaine caisse et espèces en la réponse de l’écran', async () => {
    serveurCaisses();
    const reponse = await lireCaisses('4');
    // Les plus anciennes d'abord, la caisse ouverte à la fin.
    expect(reponse.sessions.map((s) => s.id)).toEqual(['1', '2']);
    expect(reponse.sessions[0]).toMatchObject({
      type: 'nuit',
      fonds: 20000,
      attendu: 21600,
      compte: 21000,
      enCours: false,
      ouverture: { heure: '21:30', par: 'Davy Caisse' },
      recette: 5600,
      fermeture: { heure: '05:10', par: 'Willy Gérant' },
    });
    expect(reponse.sessions[1]).toMatchObject({ enCours: true, fermeture: null, attendu: 21600 });
    expect(reponse.caisseOuverte).toEqual({
      id: '2',
      jour: '2026-11-13',
      type: 'jour',
      caissiere: { id: '4', nom: 'Davy Caisse' },
      ouverture: { heure: '08:00', par: 'Davy Caisse' },
    });
    expect(reponse.detail).toEqual({
      fonds: 20000,
      especes: 1600,
      depenses: 0,
      remises: 0,
      attendu: 21600,
    });
    expect(reponse.plafond).toBe(100000);
    expect(reponse.prochaine).toEqual({ type: 'nuit', jour: '2026-11-13', planifiee: null });
    expect(reponse.caissieres).toEqual([{ id: '4', nom: 'Davy Caisse' }]);
    expect(reponse.recapitulatif).toEqual({ '4': { ouvertures: 2, recette: 5600, ecart: -600 } });
    expect(reponse.rouvrable).toBe(false);
    expect(reponse.moi).toBe('4');
    // Le gérant de la semaine, puis le coffre.
    expect(reponse.receveurs).toEqual([
      { id: '3', nom: 'Willy Gérant' },
      { id: COFFRE, nom: '' },
    ]);
  });

  it('garde la liste quand le détail des espèces est refusé', async () => {
    serveurCaisses({ especesRefusees: true });
    const reponse = await lireCaisses('4');
    expect(reponse.detail).toBeNull();
    expect(reponse.plafond).toBe(100000);
    expect(reponse.sessions).toHaveLength(2);
  });

  it('la dernière caisse fermée peut être rouverte quand aucune n’est ouverte', async () => {
    serveurCaisses();
    serveur.use(
      http.get('*/api/v1/caisses/', () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [FERMEE] }),
      ),
    );
    const reponse = await lireCaisses('4');
    expect(reponse.caisseOuverte).toBeNull();
    // Aucun détail lisible pour cette caisse fermée : rien d'inventé.
    expect(reponse.detail).toBeNull();
    expect(reponse.rouvrable).toBe(true);
  });

  it('sans caisse ouverte, le détail des espèces est celui de la dernière fermée (dépenses du récapitulatif)', async () => {
    serveurCaisses();
    serveur.use(
      http.get('*/api/v1/caisses/', () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [FERMEE] }),
      ),
      http.get('*/api/v1/caisses/1/especes/', () =>
        HttpResponse.json({ ...ESPECES, depenses: 3000, attendu: 18600 }),
      ),
    );
    const reponse = await lireCaisses('4');
    expect(reponse.caisseOuverte).toBeNull();
    expect(reponse.detail).toMatchObject({ depenses: 3000, attendu: 18600 });
  });

  it('une caisse sans attendu ni espèces garde le fonds comme attendu', () => {
    expect(versSessionDeCaisse(OUVERTE as never, null).attendu).toBe(20000);
  });

  it('le hook lit l’identifiant de la personne connectée (id de /users/me/, #296)', async () => {
    serveurCaisses();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCaisses('Davy'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.moi).toBe('4');
  });
});

describe('actions de caisse sur le vrai serveur', () => {
  const enveloppe = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

  it('ouvre une caisse avec le fonds compté', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/caisses/ouvrir/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json(OUVERTE, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useOuvrirCaisse('Davy'), { wrapper: enveloppe() });
    await act(async () => {
      await result.current.mutateAsync({ fonds: 20000 });
    });
    expect(corps).toEqual({ fonds: 20000 });
  });

  it('ferme la caisse ouverte avec le comptage, et remonte un refus du serveur', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/caisses/2/fermer/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ caisse: FERMEE, resultat: 'manque' });
      }),
      http.post('*/api/v1/caisses/9/fermer/', () =>
        HttpResponse.json({ detail: 'Déjà fermée', code: 'caisse_fermee' }, { status: 409 }),
      ),
    );
    const bonne = renderHook(() => useFermerCaisse('Davy', '2'), { wrapper: enveloppe() });
    await act(async () => {
      await bonne.result.current.mutateAsync({ compte: 21000 });
    });
    expect(corps).toEqual({ compte: 21000 });
    const refusee = renderHook(() => useFermerCaisse('Davy', '9'), { wrapper: enveloppe() });
    await expect(refusee.result.current.mutateAsync({ compte: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'caisse_fermee',
    });
  });

  it('refuse de fermer sans caisse choisie, sans appeler le serveur', async () => {
    const { result } = renderHook(() => useFermerCaisse('Davy', undefined), {
      wrapper: enveloppe(),
    });
    await expect(result.current.mutateAsync({ compte: 1 })).rejects.toThrow('Aucune caisse');
  });

  it('rouvre la dernière caisse fermée avec son motif', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/caisses/1/rouvrir/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ ...FERMEE, statut: 'rouverte', en_cours: true });
      }),
    );
    const { result } = renderHook(() => useRouvrirCaisse('Willy', '1'), { wrapper: enveloppe() });
    await act(async () => {
      await result.current.mutateAsync({ motif: 'Erreur de comptage' });
    });
    expect(corps).toEqual({ motif: 'Erreur de comptage' });
  });

  it('remet au coffre (receveur vide) ou à un gérant, avec une clé d’idempotence à chaque envoi', async () => {
    const recus: { corps: unknown; cle: string | null }[] = [];
    serveur.use(
      http.post('*/api/v1/caisses/2/remettre/', async ({ request }) => {
        recus.push({ corps: await request.json(), cle: request.headers.get('Idempotency-Key') });
        return HttpResponse.json({ ...ESPECES, remises: 5000, attendu: 16600 }, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useRemettreAuCoffre('Davy', '2'), {
      wrapper: enveloppe(),
    });
    let resultat;
    await act(async () => {
      resultat = await result.current.mutateAsync({ montant: 5000, receveur: COFFRE });
      await result.current.mutateAsync({ montant: 1000, receveur: '3' });
    });
    expect(recus[0]?.corps).toEqual({ montant: 5000, receveur: null });
    expect(recus[1]?.corps).toEqual({ montant: 1000, receveur: 3 });
    expect(recus[0]?.cle).toBeTruthy();
    expect(recus[1]?.cle).toBeTruthy();
    expect(recus[0]?.cle).not.toBe(recus[1]?.cle);
    expect(resultat).toMatchObject({ attendu: 16600 });
  });
});
