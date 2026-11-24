import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cleFiches, useFiches, useModifierFiche } from './api.ts';
import {
  codeAffiche,
  lireFichesReelles,
  prixDesMatieres,
  versFiche,
  versRecette,
  versRecetteServeur,
} from './fiches.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const FICHE = {
  version: 2,
  poids_boule: 7300,
  pains_par_boule: 20,
  pains_par_sac: 216,
  boules_par_sac: '10.80',
  procede: '',
  recette: {
    farine: '50.000',
    eau: '27.400',
    sel: '600.000',
    levure: '450.000',
    ameliorant: '300.000',
    glace: '5.000',
  },
  cout: { par_sac: 19525, par_pain: 90, marge_par_pain: 70, sans_prix: [] },
  cree_par_nom: 'Willy Gérant',
  cree_le: '2026-11-13T10:15:00+01:00',
};
const GC135 = {
  id: 3,
  code: 'GC135',
  nom: 'Gros court 135',
  nom_en: 'Short loaf 135',
  prix: 160,
  actif: true,
  ordre: 2,
  fiche: FICHE,
  cuisson_minutes: 35,
  pains_produits_mois_precedent: 4120,
};
const SANS_FICHE = { ...GC135, id: 4, code: 'PL', fiche: null };
const MATIERES = [
  {
    code: 'farine',
    nom: 'Farine',
    unite: 'kg',
    cle: true,
    stockee: true,
    prix_unitaire: '1000.00',
  },
  { code: 'sel', nom: 'Sel', unite: 'g', cle: false, stockee: true, prix_unitaire: '2.00' },
  {
    code: 'bois',
    nom: 'Bois',
    unite: 'unite',
    cle: false,
    stockee: true,
    prix_unitaire: '1000.00',
  },
  { code: 'huile', nom: 'Huile', unite: 'l', cle: false, stockee: true, prix_unitaire: null },
];
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurFiches() {
  serveur.use(
    http.get('*/api/v1/produits/', () => HttpResponse.json(page([GC135, SANS_FICHE]))),
    http.get('*/api/v1/matieres/', () => HttpResponse.json(MATIERES)),
  );
}

describe('fiches techniques sur le vrai serveur', () => {
  it('lit les fiches courantes (unités de l’écran) et les prix des matières', async () => {
    serveurFiches();
    const r = await lireFichesReelles();
    // Un produit sans fiche n'a pas de page.
    expect(r.fiches).toHaveLength(1);
    expect(r.fiches[0]).toEqual({
      id: 'gc135',
      idServeur: 3,
      code: 'GC 135',
      nom: 'Gros court 135',
      nomEn: 'Short loaf 135',
      recette: {
        boule: 7300,
        pb: 20,
        farine: 50,
        eau: 27.4,
        sel: 0.6,
        levure: 0.45,
        ameliorant: 0.3,
        glace: 5,
      },
      version: 2,
      modifieLe: '2026-11-13',
      modifieA: '10:15',
      modifiePar: 'Willy Gérant',
      prix: [160, 160],
      produitsOctobre: 4120,
      cuisson: 35,
    });
    // Farine au sac (×50), sel au kilo (grammes ×1000), bois à l'unité ; sans prix reçu, 0.
    expect(r.prix).toMatchObject({ farine: 50000, sel: 2000, bois: 1000, huile: 0, levure: 0 });
  });

  it('les conversions : grammes ↔ kilos, code affiché, prix d’un produit sans tarif', () => {
    expect(versRecette(FICHE as never).sel).toBe(0.6);
    expect(
      versRecetteServeur({
        boule: 1,
        pb: 1,
        farine: 50,
        eau: 27.4,
        sel: 0.6,
        levure: 0.45,
        ameliorant: 0.3,
        glace: 5,
      }),
    ).toEqual({
      farine: '50',
      eau: '27.4',
      glace: '5',
      sel: '600',
      levure: '450',
      ameliorant: '300',
    });
    expect(codeAffiche('GC135')).toBe('GC 135');
    expect(codeAffiche('BAG')).toBe('BAG');
    expect(versFiche({ ...GC135, prix: 0 } as never)?.prix).toBeNull();
    expect(prixDesMatieres([])).toMatchObject({ farine: 0 });
  });

  it('modifier une fiche crée une nouvelle version avec le rendement du sac et des grammes', async () => {
    serveurFiches();
    const client = new QueryClient();
    client.setQueryData(cleFiches('Willy'), await lireFichesReelles());
    let corps: Record<string, unknown> = {};
    serveur.use(
      http.post('*/api/v1/produits/3/nouvelle-version/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...FICHE, version: 3 }, { status: 201 });
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useModifierFiche('Willy'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        id: 'gc135',
        recette: {
          boule: 7300,
          pb: 20,
          farine: 50,
          eau: 27.4,
          sel: 0.7,
          levure: 0.45,
          ameliorant: 0.3,
          glace: 5,
        },
      });
    });
    expect(corps).toMatchObject({
      poids_boule: 7300,
      pains_par_boule: 20,
      recette: { sel: '700', levure: '450', farine: '50' },
    });
    expect(typeof corps.pains_par_sac).toBe('number');
    expect(corps.pains_par_sac as number).toBeGreaterThan(100);
  });

  it('un produit inconnu est refusé sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleFiches('Willy'), { fiches: [], prix: {} });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useModifierFiche('Willy'), { wrapper });
    await expect(
      result.current.mutateAsync({ id: 'zzz', recette: {} as never }),
    ).rejects.toMatchObject({ code: 'produit_inconnu' });
  });

  it('le hook lit les fiches une fois la personne connue', async () => {
    serveurFiches();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useFiches('Willy'), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(result.current.data?.fiches[0]?.code).toBe('GC 135');
  });
});
