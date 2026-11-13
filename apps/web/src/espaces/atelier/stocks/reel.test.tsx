import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useEnregistrerMouvement } from './api.ts';
import {
  lireStocksReels,
  origineDuMouvement,
  versFiche,
  versMouvement,
  versReception,
} from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const mouvement = (champs: Record<string, unknown>) => ({
  id: 6,
  matiere: 'bois',
  sens: 1,
  quantite: '10.000',
  genre: 'achat',
  source_type: 'depense',
  source_id: 10,
  motif: 'Marché',
  semaine: 1,
  auteur: 'Davy Caisse',
  cree_le: '2026-11-13T15:17:31+01:00',
  ...champs,
});
const ETAT = [
  {
    matiere: 'farine',
    nom: 'Farine',
    unite: 'kg',
    quantite: '250.000',
    besoin_par_session: '100.000',
    sessions_restantes: '2.5',
    prochaine_reception: { jour: '2026-11-16', quantite: '500.000' },
    valeur: 125000,
    statut: 'a_surveiller',
  },
  {
    matiere: 'eau',
    nom: 'Eau',
    unite: 'l',
    quantite: '0.000',
    besoin_par_session: '0.000',
    sessions_restantes: null,
    prochaine_reception: null,
    valeur: 0,
    statut: 'stock_bas',
  },
  {
    matiere: 'sel',
    nom: 'Sel',
    unite: 'g',
    quantite: '0.000',
    besoin_par_session: '0.000',
    sessions_restantes: null,
    prochaine_reception: null,
    valeur: 0,
    statut: 'stock_bas',
  },
];
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurStocks() {
  serveur.use(
    http.get('*/api/v1/mouvements-stock/etat/', () => HttpResponse.json(ETAT)),
    http.get('*/api/v1/mouvements-stock/', () =>
      HttpResponse.json(
        page([
          mouvement({ id: 1 }),
          mouvement({
            id: 3,
            genre: 'perte',
            sens: -1,
            quantite: '2.000',
            motif: 'Casse',
            source_type: 'manuel',
          }),
          mouvement({ id: 2, matiere: 'eau' }),
        ]),
      ),
    ),
  );
}

describe('lecture des stocks sur le vrai serveur', () => {
  it('compose les fiches (prix déduit de la valeur), la réception annoncée et les mouvements', async () => {
    serveurStocks();
    const i = await lireStocksReels();
    // L'eau n'est pas suivie par l'écran.
    expect(i.matieres).toEqual([
      { cle: 'farine', stock: 250, besoin: 100, prix: 500 },
      { cle: 'sel', stock: 0, besoin: 0, prix: 0 },
    ]);
    expect(i.receptions).toEqual([{ matiere: 'farine', jour: '2026-11-16', quantite: 500 }]);
    expect(i.mouvements.map((m) => [m.id, m.type])).toEqual([
      ['3', 'perte'],
      ['1', 'entree'],
    ]);
    expect(i.sacsParSession).toBeUndefined();
    expect(i.inventaires).toEqual([]);
  });

  it('les types de mouvement : achat, réception, production, perte, correction, inventaire', () => {
    const type = (champs: Record<string, unknown>) =>
      versMouvement(mouvement(champs) as never)?.type;
    expect(type({ genre: 'achat' })).toBe('entree');
    expect(type({ genre: 'reception' })).toBe('entree');
    expect(type({ genre: 'production', sens: -1 })).toBe('sortie');
    expect(type({ genre: 'perte', sens: -1 })).toBe('perte');
    expect(type({ genre: 'correction', sens: 1 })).toBe('entree');
    const ajustement = versMouvement(
      mouvement({ genre: 'inventaire', sens: -1, quantite: '3.000' }) as never,
    );
    expect(ajustement).toMatchObject({ type: 'ajustement', quantite: -3 });
  });

  it('l’origine : achat au marché ou chez un fournisseur, réception, production, inventaire, saisie', () => {
    const o = (champs: Record<string, unknown>) => origineDuMouvement(mouvement(champs) as never);
    expect(o({})).toEqual({ genre: 'depense', code: 'DEP-0010', achat: 'marche' });
    expect(o({ motif: 'Moulin du Centre' })).toEqual({
      genre: 'depense',
      code: 'DEP-0010',
      achat: 'fournisseur',
      fournisseur: 'Moulin du Centre',
    });
    expect(o({ genre: 'reception', motif: 'Moulin' })).toMatchObject({
      genre: 'reception',
      fournisseur: 'Moulin',
    });
    expect(o({ genre: 'production', motif: 'nuit du 13' })).toMatchObject({
      genre: 'production',
      creneau: 'nuit',
    });
    expect(o({ genre: 'inventaire', source_id: 7 })).toMatchObject({
      genre: 'inventaire',
      code: 'AUD-7',
    });
    expect(o({ genre: 'perte', motif: 'Casse' })).toEqual({ genre: 'manuel', motif: 'Casse' });
  });

  it('fiche sans stock : prix 0 ; réception sans jour : ignorée', () => {
    expect(versFiche({ ...ETAT[2] } as never)).toMatchObject({ prix: 0 });
    expect(versReception({ ...ETAT[0], prochaine_reception: {} } as never)).toBeUndefined();
  });
});

describe('saisie d’un mouvement sur le vrai serveur', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

  it('une perte sort du stock ; une entrée à la main est une correction positive', async () => {
    serveurStocks();
    const recus: unknown[] = [];
    serveur.use(
      http.post('*/api/v1/mouvements-stock/saisir/', async ({ request }) => {
        recus.push(await request.json());
        return HttpResponse.json(mouvement({}), { status: 201 });
      }),
    );
    const { result } = renderHook(() => useEnregistrerMouvement('Serge'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        type: 'perte',
        matiere: 'farine',
        quantite: 2.5,
        motif: 'Casse',
      });
      await result.current.mutateAsync({
        type: 'entree',
        matiere: 'sel',
        quantite: 4,
        motif: 'Don',
      });
    });
    expect(recus).toEqual([
      { matiere: 'farine', quantite: '2.5', genre: 'perte', sens: -1, motif: 'Casse' },
      { matiere: 'sel', quantite: '4', genre: 'correction', sens: 1, motif: 'Don' },
    ]);
  });

  it('un refus du serveur remonte son code', async () => {
    serveur.use(
      http.post('*/api/v1/mouvements-stock/saisir/', () =>
        HttpResponse.json({ detail: 'non', code: 'droit_insuffisant' }, { status: 403 }),
      ),
    );
    const { result } = renderHook(() => useEnregistrerMouvement('Davy'), { wrapper });
    await expect(
      result.current.mutateAsync({ type: 'perte', matiere: 'farine', quantite: 1, motif: 'x' }),
    ).rejects.toMatchObject({ status: 403, code: 'droit_insuffisant' });
  });
});
