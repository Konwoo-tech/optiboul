import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useDecider } from './api.ts';
import { lireDemandesReelles, objetDeLaDemande, versDemande } from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const base = {
  motif: 'm',
  valideurs: ['gerant', 'proprietaire'],
  echeance: null,
  escaladee_le: null,
  decide_par_nom: '',
  decide_le: null,
  cree_le: '2026-11-13T14:56:53+01:00',
  emetteur: { id: 4, nom: 'Davy Caisse' },
  emetteur_profil: 'caissier',
  statut: 'en_attente',
};
const PLAFOND = {
  ...base,
  id: 3,
  numero: 3,
  code: 'DEM-003',
  type: 'plafond',
  type_libelle: 'Livraison au-delà du plafond',
  objet_type: 'livraison',
  objet_id: 8,
  objet: 'Ebène · bon n° 8 · 1000 FCFA',
  details: {
    client: 3,
    client_nom: 'Ebène',
    numero: 8,
    montant_du: 1000,
    solde_apres: -3000,
    plafond: 2000,
  },
};
const DEPENSE = {
  ...base,
  id: 7,
  numero: 7,
  code: 'DEM-007',
  type: 'depense',
  type_libelle: 'Dépense au-dessus du seuil',
  objet_type: 'depense',
  objet_id: 2,
  objet: 'DEP-0002 · Réparation pétrin · 60000 FCFA',
  details: { numero: 'DEP-0002', montant: 60000 },
  emetteur: { id: 3, nom: 'Willy Gérant' },
  emetteur_profil: 'gerant',
  valideurs: ['proprietaire'],
};
const PAIE = {
  ...base,
  id: 9,
  numero: 9,
  type: 'paie',
  type_libelle: 'État de paie',
  objet_type: 'etat_paie',
  objet_id: 1,
  objet: 'Paie de 11/2026',
  details: { mois: '2026-11-01', total_net: 900000, lignes: 12 },
};
const SUPPLEMENT = {
  ...base,
  id: 10,
  numero: 10,
  type: 'supplement',
  type_libelle: 'Supplément de production',
  objet: 'Plan de nuit',
  details: {},
};
const INVENTAIRE = {
  ...base,
  id: 11,
  numero: 11,
  type: 'inventaire',
  type_libelle: 'Écart de stock',
  objet: 'Contrôle de stock du 13/11',
  details: {},
};
const SEMAINE = {
  id: 1,
  code: 'S46',
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant' },
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const semaineDe = () => 46;

describe('lecture des demandes sur le vrai serveur', () => {
  it('lit les cinq types, le gérant de la semaine, les plus récentes d’abord', async () => {
    serveur.use(
      http.get('*/api/v1/demandes/', () =>
        HttpResponse.json(
          page([
            PLAFOND,
            DEPENSE,
            PAIE,
            SUPPLEMENT,
            INVENTAIRE,
            { ...DEPENSE, id: 12, numero: 12, type: 'inconnu' },
          ]),
        ),
      ),
      http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE]))),
    );
    const r = await lireDemandesReelles('proprietaire', 'Patron Dev');
    expect(r.gerant).toBe('Willy Gérant');
    expect(r.proprietaire).toBe('Patron Dev');
    expect(r.demandes.map((d) => [d.numero, d.type])).toEqual([
      [11, 'inventaire'],
      [10, 'production'],
      [9, 'paie'],
      [7, 'depense'],
      [3, 'plafond'],
    ]);
    expect(r.demandes.find((d) => d.numero === 3)).toMatchObject({
      id: '3',
      titre: 'Livraison au-delà du plafond',
      detail: 'Ebène · bon n° 8 · 1000 FCFA',
      par: 'Davy Caisse',
      parProfil: 'caissier',
      jour: '2026-11-13',
      heure: '14:56',
      statut: 'en-attente',
      objet: { genre: 'client', id: '3', nom: 'Ebène', solde: -3000 },
    });
  });

  it('le propriétaire n’est nommé que s’il est la personne connectée', async () => {
    serveur.use(
      http.get('*/api/v1/demandes/', () => HttpResponse.json(page([]))),
      http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE]))),
    );
    expect((await lireDemandesReelles('gerant', 'Willy')).proprietaire).toBe('');
  });

  it('une demande décidée garde qui a décidé et quand', () => {
    const accordee = versDemande(
      {
        ...PLAFOND,
        statut: 'accordee',
        decide_par_nom: 'Willy Gérant',
        decide_le: '2026-11-13T15:10:00+01:00',
      } as never,
      semaineDe,
    );
    expect(accordee).toMatchObject({
      statut: 'acceptee',
      decidePar: 'Willy Gérant',
      decideA: '15:10',
    });
    const refusee = versDemande(
      { ...PLAFOND, statut: 'refusee', decide_par_nom: 'W', decide_le: null } as never,
      semaineDe,
    );
    expect(refusee).toMatchObject({ statut: 'refusee', decideA: '' });
  });

  it('les objets liés : dépense (semaine), paie (mois), production, inventaire', () => {
    expect(objetDeLaDemande(DEPENSE as never, semaineDe)).toEqual({
      genre: 'depense',
      code: 'DEP-0002',
      montant: 60000,
      semaine: 46,
    });
    expect(objetDeLaDemande(PAIE as never, semaineDe)).toEqual({ genre: 'paie', mois: '2026-11' });
    expect(objetDeLaDemande(SUPPLEMENT as never, semaineDe)).toEqual({ genre: 'production' });
    expect(objetDeLaDemande(INVENTAIRE as never, semaineDe)).toEqual({
      genre: 'inventaire',
      code: 'Contrôle de stock du 13/11',
    });
    expect(objetDeLaDemande({ ...PAIE, type: 'x' } as never, semaineDe)).toBeNull();
  });
});

describe('décision sur le vrai serveur', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

  it('accorde sans code (la personne connectée décide) ; refuse avec un motif', async () => {
    const recus: { chemin: string; corps: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/demandes/:id/:decision/', async ({ request, params }) => {
        recus.push({ chemin: `${params.id}/${params.decision}`, corps: await request.json() });
        return HttpResponse.json(PLAFOND);
      }),
    );
    const { result } = renderHook(() => useDecider('Willy'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: '3', accord: true });
      await result.current.mutateAsync({ id: '4', accord: false });
    });
    expect(recus[0]).toEqual({ chemin: '3/accorder', corps: {} });
    expect(recus[1]?.chemin).toBe('4/refuser');
    expect(recus[1]?.corps).toMatchObject({ motif: expect.any(String) });
  });

  it('un refus du serveur remonte son code (droit insuffisant, déjà décidée)', async () => {
    serveur.use(
      http.post('*/api/v1/demandes/5/accorder/', () =>
        HttpResponse.json({ detail: 'non', code: 'demande_deja_decidee' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useDecider('Willy'), { wrapper });
    await expect(result.current.mutateAsync({ id: '5', accord: true })).rejects.toMatchObject({
      status: 409,
      code: 'demande_deja_decidee',
    });
  });
});
