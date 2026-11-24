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
  derniere_echec: null,
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

  it('lance la sauvegarde du genre demandé (202), suit la copie annoncée, puis relit la liste', async () => {
    let corps: unknown;
    let lectures = 0;
    serveur.use(
      http.post('*/api/v1/sauvegardes/lancer/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ id: 6, genre: 'locale', statut: 'en_cours' }, { status: 202 });
      }),
      http.get('*/api/v1/sauvegardes/6/', () => {
        lectures += 1;
        return HttpResponse.json(
          lectures < 2
            ? COPIE(6, 'locale', 'manuelle', 'en_cours')
            : COPIE(6, 'locale', 'manuelle'),
        );
      }),
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(page([COPIE(1, 'locale', 'planifiee'), COPIE(6, 'locale', 'manuelle')])),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
    );
    const { result } = renderHook(() => useSauvegarderLocale('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    let reponse: unknown;
    await act(async () => {
      reponse = await result.current.mutateAsync();
    });
    expect(corps).toEqual({ genre: 'locale' });
    expect(lectures).toBe(2);
    expect(reponse).toMatchObject({ copie: { id: '6', declencheur: 'manuelle' } });
  });

  it('une copie en échec devient une erreur avec le message du serveur', async () => {
    serveur.use(
      http.post('*/api/v1/sauvegardes/lancer/', () =>
        HttpResponse.json({ id: 7, genre: 'cloud', statut: 'en_cours' }, { status: 202 }),
      ),
      http.get('*/api/v1/sauvegardes/7/', () =>
        HttpResponse.json({
          ...COPIE(7, 'cloud', 'manuelle', 'echec'),
          erreur: 'Cloud injoignable',
        }),
      ),
    );
    const { result } = renderHook(() => useSauvegarderCloud('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(result.current.mutateAsync()).rejects.toMatchObject({
      code: 'sauvegarde_echec',
      message: 'Cloud injoignable',
    });
  });

  it('une copie trop longue est annoncée « en attente »', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveur.use(
      http.post('*/api/v1/sauvegardes/lancer/', () =>
        HttpResponse.json({ id: 8, genre: 'cloud', statut: 'en_cours' }, { status: 202 }),
      ),
      http.get('*/api/v1/sauvegardes/8/', () =>
        HttpResponse.json(COPIE(8, 'cloud', 'manuelle', 'en_cours')),
      ),
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(page([COPIE(1, 'cloud', 'planifiee')])),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
    );
    const { result } = renderHook(() => useSauvegarderCloud('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    let reponse: unknown;
    await act(async () => {
      const promesse = result.current.mutateAsync();
      await vi.advanceTimersByTimeAsync(12000);
      reponse = await promesse;
    });
    expect(reponse).toMatchObject({ copie: { id: 'en-attente', genre: 'cloud' } });
  });

  it('restaure la copie choisie : confirmation, clé d’idempotence, copie de sûreté et contrôles', async () => {
    let corps: unknown;
    let cle: string | null = null;
    serveur.use(
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(
          page([COPIE(3, 'locale', 'cloture_semaine'), COPIE(1, 'locale', 'planifiee')]),
        ),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
      http.post('*/api/v1/sauvegardes/3/restaurer/', async ({ request }) => {
        corps = await request.json();
        cle = request.headers.get('Idempotency-Key');
        return HttpResponse.json({
          copie_avant: COPIE(9, 'locale', 'avant_restauration'),
          controles: [
            { cle: 'sessions', ok: true, avant: 14, apres: 14 },
            { cle: 'soldes_clients', ok: false, avant: 14050, apres: 14000 },
            { cle: 'stocks', ok: true, avant: 9, apres: 9 },
          ],
          restauration: { id: 7, statut: 'terminee', sauvegarde: 3, copie_de_surete: 9 },
        });
      }),
    );
    const { result } = renderHook(() => useRestaurer('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    let reponse: unknown;
    await act(async () => {
      reponse = await result.current.mutateAsync('3');
    });
    expect(corps).toEqual({ confirmation: 'RESTAURER' });
    expect(cle).toBeTruthy();
    expect(reponse).toMatchObject({
      restauration: {
        copie: { id: '3', declencheur: 'cloture' },
        copieAvant: { id: '9' },
        controles: [
          { cle: 'sessions', ok: true },
          { cle: 'soldes_clients', ok: false },
          { cle: 'stocks', ok: true },
        ],
      },
    });
  });

  it('une restauration déjà en cours est refusée avec son code', async () => {
    serveur.use(
      http.get('*/api/v1/sauvegardes/', () =>
        HttpResponse.json(page([COPIE(3, 'locale', 'manuelle')])),
      ),
      http.get('*/api/v1/sauvegardes/etat/', () => HttpResponse.json(ETAT)),
      http.post('*/api/v1/sauvegardes/3/restaurer/', () =>
        HttpResponse.json(
          { detail: 'Une restauration est déjà en cours.', code: 'restauration_en_cours' },
          { status: 409 },
        ),
      ),
    );
    const { result } = renderHook(() => useRestaurer('Admin'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(result.current.mutateAsync('3')).rejects.toMatchObject({
      code: 'restauration_en_cours',
    });
  });
});
