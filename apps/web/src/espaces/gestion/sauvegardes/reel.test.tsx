import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useRestaurer, useSauvegarderCloud, useSauvegarderLocale } from './api.ts';
import { lireSauvegardesReelles, versCopie } from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  serveur.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const COPIE = (id: number, genre: string, declencheur: string, statut = 'reussie') => ({
  id,
  genre,
  declencheur,
  statut,
  source: null,
  emplacement: '/sauvegardes/x',
  taille: 1024,
  erreur: '',
  debut: `2026-11-19T0${id}:00:00+01:00`,
  fin: statut === 'en_cours' ? null : `2026-11-19T0${id}:01:00+01:00`,
});
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const ETAT = {
  derniere_locale: '2026-11-19T03:01:00+01:00',
  derniere_cloud: null,
  cloud_en_retard: true,
  seuil_alerte_heures: 24,
};

describe('lecture des sauvegardes sur le vrai serveur', () => {
  it('compose les copies réussies (récentes d’abord), l’état et l’alerte cloud', async () => {
    serveur.use(
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(
          page([
            COPIE(1, 'locale', 'planifiee'),
            COPIE(2, 'cloud', 'cloture_caisse', 'echec'),
            COPIE(3, 'locale', 'cloture_semaine'),
            COPIE(4, 'locale', 'manuelle', 'en_cours'),
          ]),
        ),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
    );
    const i = await lireSauvegardesReelles();
    expect(i.copies.map((c) => [c.id, c.genre, c.declencheur])).toEqual([
      ['3', 'locale', 'cloture'],
      ['1', 'locale', 'planifiee'],
    ]);
    expect(i).toMatchObject({
      derniereLocale: ETAT.derniere_locale,
      derniereCloud: null,
      cloudEnRetard: true,
      seuilAlerteHeures: 24,
    });
    expect(versCopie(COPIE(5, 'cloud', 'inconnu') as never)).toMatchObject({
      declencheur: 'manuelle',
    });
  });
});

describe('actions sur le vrai serveur', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

  it('lance la sauvegarde (202) et attend la nouvelle copie', async () => {
    let lancees = 0;
    serveur.use(
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(
          page(
            lancees
              ? [COPIE(1, 'locale', 'planifiee'), COPIE(6, 'locale', 'manuelle')]
              : [COPIE(1, 'locale', 'planifiee')],
          ),
        ),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
      http.post('*/api/v1/sauvegardes/lancer/', () => {
        lancees += 1;
        return new HttpResponse(null, { status: 202 });
      }),
    );
    const { result } = renderHook(() => useSauvegarderLocale('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    let reponse: unknown;
    await act(async () => {
      reponse = await result.current.mutateAsync();
    });
    expect(lancees).toBe(1);
    expect(reponse).toMatchObject({ copie: { id: '6', declencheur: 'manuelle' } });
  });

  it('sans nouvelle copie après quelques relectures, la copie annoncée est celle de l’instant', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveur.use(
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(page([COPIE(1, 'cloud', 'planifiee')])),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
      http.post('*/api/v1/sauvegardes/lancer/', () => new HttpResponse(null, { status: 202 })),
    );
    const { result } = renderHook(() => useSauvegarderCloud('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    let reponse: unknown;
    await act(async () => {
      const promesse = result.current.mutateAsync();
      await vi.advanceTimersByTimeAsync(9000);
      reponse = await promesse;
    });
    expect(reponse).toMatchObject({ copie: { id: 'en-attente', genre: 'cloud' } });
  });

  it('la restauration n’existe pas sur le serveur', async () => {
    const { result } = renderHook(() => useRestaurer('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(result.current.mutateAsync('1')).rejects.toMatchObject({ code: 'indisponible' });
  });
});
