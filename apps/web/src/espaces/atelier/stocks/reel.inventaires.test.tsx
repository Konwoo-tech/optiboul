import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cleStocks, useEnregistrerInventaire } from './api.ts';
import { lireStocksReels, versControle, versInventaire, versReceptions } from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const AUJOURDHUI = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(
  new Date(),
);
const SEMAINE = {
  id: 1,
  code: 'S46',
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant', profil: 'gerant' },
  production: { id: 5, nom: 'Serge Production', profil: 'production' },
};
const FAIT = {
  id: 4,
  semaine: 1,
  jour: '2026-11-11',
  portee: 'cles',
  statut: 'fait',
  fait_le: '2026-11-11T09:30:00+01:00',
  lignes: [
    { matiere: 'farine', theorique: '100.000', compte: '98.000', statut: 'ajustee' },
    { matiere: 'levure', theorique: '500.000', compte: '300.000', statut: 'soumise' },
    { matiere: 'eau', theorique: '0.000', compte: '0.000', statut: 'ajustee' },
  ],
};
const DIMANCHE = {
  ...FAIT,
  id: 5,
  jour: '2026-11-15',
  portee: 'toutes',
  statut: 'prevu',
  fait_le: null,
  lignes: [],
};
const DUJOUR = {
  ...FAIT,
  id: 6,
  jour: AUJOURDHUI,
  portee: 'cles',
  statut: 'a_faire',
  fait_le: null,
  lignes: [],
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurStocks(controles: unknown[]) {
  serveur.use(
    http.get('*/api/v1/mouvements-stock/etat/', () => HttpResponse.json([])),
    http.get('*/api/v1/mouvements-stock/', () => HttpResponse.json(page([]))),
    http.get('*/api/v1/controles-stock/', () => HttpResponse.json(page(controles))),
    http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE]))),
    http.get('*/api/v1/receptions-planifiees/', () =>
      HttpResponse.json(
        page([
          {
            id: 1,
            fournisseur: 4,
            fournisseur_nom: 'Moulin',
            matiere: 'farine',
            quantite: '500.000',
            prevue_le: '2026-11-20',
            statut: 'planifiee',
            planifiee_par: 'W',
            cree_le: '2026-11-13T10:00:00+01:00',
          },
          {
            id: 2,
            fournisseur: 4,
            fournisseur_nom: 'Moulin',
            matiere: 'farine',
            quantite: '200.000',
            prevue_le: '2026-11-16',
            statut: 'planifiee',
            planifiee_par: 'W',
            cree_le: '2026-11-13T10:00:00+01:00',
          },
          {
            id: 3,
            fournisseur: 4,
            fournisseur_nom: 'Moulin',
            matiere: 'sel',
            quantite: '5.000',
            prevue_le: '2026-11-17',
            statut: 'annulee',
            planifiee_par: 'W',
            cree_le: '2026-11-13T10:00:00+01:00',
          },
        ]),
      ),
    ),
  );
}

describe('inventaires et contrôles sur le vrai serveur', () => {
  it('lit les contrôles de la semaine, les inventaires faits et les réceptions planifiées', async () => {
    serveurStocks([DIMANCHE, FAIT, DUJOUR]);
    const i = await lireStocksReels();
    expect(i.controles.map((c) => [c.jour, c.moment, c.semaine, c.gerant])).toEqual(
      [
        ['2026-11-11', 'mercredi', 46, 'Willy Gérant'],
        ['2026-11-15', 'dimanche', 46, 'Willy Gérant'],
        [AUJOURDHUI, 'mercredi', 46, 'Willy Gérant'],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    expect(i.inventaires).toHaveLength(1);
    expect(i.inventaires[0]).toMatchObject({
      id: '4',
      jour: '2026-11-11',
      heure: '09:30',
      statut: 'a-valider',
      lignes: [
        { matiere: 'farine', theorique: 100, compte: 98 },
        { matiere: 'levure', theorique: 500, compte: 300 },
      ],
    });
    // Le contrôle du jour fait compter les matières clés.
    expect(i.controleDuJourId).toBe('6');
    expect(i.matieresACompter).toEqual(['farine', 'levure', 'ameliorant']);
    // La plus proche réception de la farine ; l'annulée est ignorée.
    expect(i.receptions).toEqual([
      { matiere: 'farine', jour: '2026-11-16', quantite: 200 },
      { matiere: 'farine', jour: '2026-11-20', quantite: 500 },
    ]);
  });

  it('le contrôle du dimanche porte sur toutes les matières suivies', async () => {
    serveurStocks([{ ...DUJOUR, portee: 'toutes' }]);
    const i = await lireStocksReels();
    expect(i.matieresACompter).toHaveLength(7);
  });

  it('sans contrôle du jour, rien à compter', async () => {
    serveurStocks([FAIT]);
    const i = await lireStocksReels();
    expect(i.controleDuJourId).toBeUndefined();
    expect(i.matieresACompter).toBeUndefined();
  });

  it('les statuts d’un inventaire : ajusté, à valider, refusé', () => {
    const avec = (statuts: string[]) =>
      versInventaire({
        ...FAIT,
        lignes: statuts.map((statut) => ({
          matiere: 'farine',
          theorique: '1',
          compte: '1',
          statut,
        })),
      } as never)?.statut;
    expect(avec(['ajustee'])).toBe('valide');
    expect(avec(['ajustee', 'soumise'])).toBe('a-valider');
    expect(avec(['refusee', 'refusee'])).toBe('refuse');
    expect(versInventaire(DIMANCHE as never)).toBeUndefined();
  });

  it('un contrôle sans semaine connue garde son numéro de semaine du serveur', () => {
    expect(versControle(FAIT as never, [])).toMatchObject({ semaine: 1, gerant: '' });
    expect(versReceptions([])).toEqual([]);
  });
});

describe('comptage sur le vrai serveur', () => {
  it('commence le contrôle du jour puis valide les quantités ; la demande revient si écart', async () => {
    serveurStocks([DUJOUR]);
    const client = new QueryClient();
    client.setQueryData(cleStocks('Serge'), await lireStocksReels());
    const appels: string[] = [];
    let comptes: unknown;
    serveur.use(
      http.post('*/api/v1/controles-stock/6/commencer/', () => {
        appels.push('commencer');
        return HttpResponse.json([{ code: 'farine', nom: 'Farine', unite: 'kg' }]);
      }),
      http.post('*/api/v1/controles-stock/6/valider/', async ({ request }) => {
        appels.push('valider');
        comptes = await request.json();
        serveurStocks([
          {
            ...DUJOUR,
            statut: 'fait',
            fait_le: '2026-11-13T10:00:00+01:00',
            lignes: [{ matiere: 'farine', theorique: '100', compte: '50', statut: 'soumise' }],
          },
        ]);
        return HttpResponse.json({ demande: 'DEM-012' });
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useEnregistrerInventaire('Serge'), { wrapper });
    let reponse;
    await act(async () => {
      reponse = await result.current.mutateAsync({ comptages: { farine: 50, levure: 12.5 } });
    });
    expect(appels).toEqual(['commencer', 'valider']);
    expect(comptes).toEqual({ comptes: { farine: '50', levure: '12.5' } });
    expect(reponse).toMatchObject({ demande: { numero: 12 }, inventaire: { statut: 'a-valider' } });
  });

  it('sans contrôle à faire aujourd’hui, le comptage est refusé sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleStocks('Serge'), { controles: [], inventaires: [] });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useEnregistrerInventaire('Serge'), { wrapper });
    await expect(result.current.mutateAsync({ comptages: { farine: 1 } })).rejects.toMatchObject({
      code: 'aucun_controle',
    });
  });
});
