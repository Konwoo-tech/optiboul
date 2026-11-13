import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { lireCaisses, useCaisses, versSessionDeCaisse } from './api.ts';

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
      fermeture: { heure: '05:10', par: 'Davy Caisse' },
    });
    expect(reponse.sessions[1]).toMatchObject({ enCours: true, fermeture: null, attendu: 21600 });
    expect(reponse.caisseOuverte).toEqual({
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
    expect(reponse.detail).toBeNull();
    expect(reponse.rouvrable).toBe(true);
  });

  it('une caisse sans attendu ni espèces garde le fonds comme attendu', () => {
    expect(versSessionDeCaisse(OUVERTE as never, null).attendu).toBe(20000);
  });

  it('le hook lit l’identifiant de la personne connectée dans son adresse', async () => {
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
