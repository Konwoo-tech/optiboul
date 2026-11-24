import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  cleFournisseurs,
  usePlanifier,
  usePayer,
  useReceptionner,
  useRelancer,
  useReplanifier,
} from './api.ts';
import {
  conditionsDe,
  lireFournisseursReels,
  numeroDeCommande,
  versCommandes,
  versFacture,
  versFournisseur,
} from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const FOURNISSEUR = {
  id: 1,
  nom: 'Grands Moulins',
  telephone: '+237 699 10 20 30',
  conditions: 'Crédit lundi-mardi',
  matieres: ['farine', 'levure'],
  actif: true,
  prochaine_reception: null,
  manquants: 1,
};
const planifiee = (id: number, statut: string, quantite = '10.000', matiere = 'levure') => ({
  id,
  fournisseur: 1,
  fournisseur_nom: 'Grands Moulins',
  matiere,
  quantite,
  prevue_le: '2026-11-19',
  statut,
  planifiee_par: 'Willy Gérant',
  cree_le: '2026-11-18T08:00:00+01:00',
  reception: null,
  recue_quantite: null,
  recue_par: null,
  recue_le: null,
});
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurFournisseurs() {
  serveur.use(
    http.get('*/api/v1/fournisseurs/', () => HttpResponse.json(page([FOURNISSEUR]))),
    http.get('*/api/v1/receptions-planifiees/', () =>
      HttpResponse.json(
        page([
          planifiee(7, 'planifiee'),
          planifiee(6, 'recue', '10.000'),
          planifiee(5, 'recue', '20.000', 'farine'),
          planifiee(4, 'annulee'),
        ]),
      ),
    ),
    http.get('*/api/v1/manquants/', () =>
      HttpResponse.json(
        page([
          {
            id: 3,
            reception: 9,
            fournisseur: 'Grands Moulins',
            matiere: 'levure',
            quantite: '4.000',
            statut: 'a_livrer',
            relances: 0,
            replanifiee: null,
            cree_le: '2026-11-18T10:00:00+01:00',
          },
        ]),
      ),
    ),
    http.get('*/api/v1/factures/', () =>
      HttpResponse.json(
        page([
          {
            id: 11,
            numero: 41,
            fournisseur: 1,
            fournisseur_nom: 'Grands Moulins',
            semaine: 1,
            farine: true,
            montant: 88000,
            echeance: '2026-11-17',
            statut: 'en_cours',
            en_retard: true,
          },
        ]),
      ),
    ),
    http.get('*/api/v1/factures/11/paiements/', () => HttpResponse.json([])),
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json(page([{ id: 1, code: 'S46', annee: 2026, numero: 46 }])),
    ),
  );
}

describe('lecture des fournisseurs sur le vrai serveur', () => {
  it('compose fiches, bons (partiel rapproché du manquant), factures et jours planifiables', async () => {
    serveurFournisseurs();
    const i = await lireFournisseursReels();
    expect(i.fournisseurs).toEqual([
      {
        id: '1',
        nom: 'Grands Moulins',
        matieres: ['farine', 'levure'],
        telephone: '699 10 20 30',
        conditions: 'credit-lundi-mardi',
        credit: true,
      },
    ]);
    // L'annulée n'apparaît pas ; le bon reçu de levure porte le manquant.
    expect(i.commandes.map((c) => [c.numero, c.statut, c.commandee, c.recue])).toEqual([
      ['BC-005', 'recue', 20, 20],
      ['BC-006', 'partielle', 10, 6],
      ['BC-007', 'planifiee', 10, 0],
    ]);
    expect(i.commandes[1]).toMatchObject({ manquant: 3, idServeur: 6, fournisseur: '1' });
    expect(i.factures[0]).toMatchObject({
      numero: 'FAC-41',
      statut: 'a-payer',
      enRetard: true,
      montant: 88000,
      objet: { genre: 'serveur', farine: true, semaine: 46 },
      idServeur: 11,
    });
    expect(i.jours).toHaveLength(8);
    expect(i.jours[0]).toBe(i.aujourdhui);
  });

  it('les conversions : conditions libres, téléphone, matières inconnues, statuts', () => {
    expect(conditionsDe('À la livraison')).toBe('a-la-livraison');
    expect(conditionsDe('Paiement à 7 jours')).toBe('sept-jours');
    expect(conditionsDe(undefined)).toBe('a-la-livraison');
    expect(
      versFournisseur({ ...FOURNISSEUR, matieres: ['farine', 'caviar'], telephone: '' } as never),
    ).toMatchObject({ matieres: ['farine'], telephone: '' });
    expect(numeroDeCommande(32)).toBe('BC-032');
    expect(versCommandes([planifiee(1, 'recue')], [])).toMatchObject([
      { statut: 'recue', recue: 10 },
    ]);
    expect(
      versFacture(
        { id: 1, numero: 2, fournisseur: 1, semaine: 9, farine: false, statut: 'payee' } as never,
        new Map(),
      ),
    ).toMatchObject({ statut: 'payee', objet: { genre: 'serveur', semaine: 0 } });
  });
});

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

describe('paiements sur le vrai serveur', () => {
  it('une facture payée en partie affiche le reste dû, une soldée son paiement', async () => {
    serveurFournisseurs();
    serveur.use(
      http.get('*/api/v1/factures/', () =>
        HttpResponse.json(
          page([
            {
              id: 11,
              numero: 41,
              fournisseur: 1,
              semaine: 1,
              farine: true,
              montant: 88000,
              echeance: '2026-11-17',
              statut: 'en_cours',
              en_retard: true,
            },
            {
              id: 12,
              numero: 42,
              fournisseur: 1,
              semaine: 1,
              farine: false,
              montant: 5000,
              echeance: '2026-11-20',
              statut: 'payee',
              en_retard: false,
            },
            {
              id: 13,
              numero: 43,
              fournisseur: 1,
              semaine: 1,
              farine: false,
              montant: 7000,
              echeance: '2026-11-20',
              statut: 'a_payer',
              en_retard: false,
            },
          ]),
        ),
      ),
      http.get('*/api/v1/factures/11/paiements/', () =>
        HttpResponse.json([
          {
            id: 1,
            facture: 11,
            montant: 30000,
            mode: 'banque',
            reference: '',
            depense: 5,
            paye_par: 'Willy',
            paye_le: '2026-11-18T09:00:00+01:00',
          },
        ]),
      ),
      http.get('*/api/v1/factures/12/paiements/', () =>
        HttpResponse.json([
          {
            id: 2,
            facture: 12,
            montant: 5000,
            mode: 'mobile',
            reference: 'MP123',
            depense: 6,
            paye_par: 'Willy',
            paye_le: '2026-11-19T10:00:00+01:00',
          },
        ]),
      ),
    );
    const { factures } = await lireFournisseursReels();
    expect(factures[0]).toMatchObject({ statut: 'a-payer', montant: 58000 });
    expect(factures[1]).toMatchObject({
      statut: 'payee',
      montant: 5000,
      mode: 'mobile',
      reference: 'MP123',
      payeeLe: '2026-11-19',
      depense: '6',
      paiement: 2,
    });
    expect(factures[2]).toMatchObject({ statut: 'a-payer', montant: 7000 });
  });

  it('paie le reste dû avec une clé d’idempotence', async () => {
    serveurFournisseurs();
    const client = new QueryClient();
    client.setQueryData(cleFournisseurs('Willy'), await lireFournisseursReels());
    const recus: { corps: unknown; cle: string | null }[] = [];
    serveur.use(
      http.post('*/api/v1/factures/11/payer/', async ({ request }) => {
        recus.push({ corps: await request.json(), cle: request.headers.get('Idempotency-Key') });
        return HttpResponse.json(
          {
            id: 3,
            facture: 11,
            montant: 88000,
            mode: 'mobile',
            reference: 'MP9',
            depense: 9,
            paye_par: 'Willy',
            paye_le: '2026-11-19T10:00:00+01:00',
          },
          { status: 201 },
        );
      }),
    );
    const { result } = renderHook(() => usePayer('Willy'), { wrapper: wrapper(client) });
    let retour: unknown;
    await act(async () => {
      retour = await result.current.mutateAsync({
        facture: 'FAC-41',
        mode: 'mobile',
        reference: 'MP9',
      });
    });
    expect(retour).toMatchObject({ depense: '9' });
    expect(recus).toEqual([
      { corps: { montant: 88000, mode: 'mobile', reference: 'MP9' }, cle: expect.any(String) },
    ]);
  });
});

describe('actions sur le vrai serveur', () => {
  it('planifie, réceptionne, relance et replanifie avec les identifiants du serveur', async () => {
    serveurFournisseurs();
    const client = new QueryClient();
    client.setQueryData(cleFournisseurs('Willy'), await lireFournisseursReels());
    const recus: { chemin: string; corps: unknown }[] = [];
    const enregistrer =
      (chemin: string, reponse: unknown, statut = 200) =>
      async ({ request }: { request: Request }) => {
        const texte = await request.text();
        recus.push({ chemin, corps: texte ? JSON.parse(texte) : null });
        return HttpResponse.json(reponse as never, { status: statut });
      };
    serveur.use(
      http.post(
        '*/api/v1/receptions-planifiees/',
        enregistrer('planifier', planifiee(8, 'planifiee'), 201),
      ),
      http.post(
        '*/api/v1/receptions-planifiees/7/receptionner/',
        enregistrer('receptionner', { id: 2, montant: 500, ecart: '-4.000', facture: {} }, 201),
      ),
      http.post('*/api/v1/manquants/3/relancer/', () => {
        recus.push({ chemin: 'relancer', corps: null });
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/manquants/3/replanifier/', enregistrer('replanifier', {})),
    );
    const w = wrapper(client);
    const planifier = renderHook(() => usePlanifier('Willy'), { wrapper: w });
    const receptionner = renderHook(() => useReceptionner('Willy'), { wrapper: w });
    const relancer = renderHook(() => useRelancer('Willy'), { wrapper: w });
    const replanifier = renderHook(() => useReplanifier('Willy'), { wrapper: w });
    let planifiee8: unknown;
    let recue: unknown;
    await act(async () => {
      planifiee8 = await planifier.result.current.mutateAsync({
        fournisseur: '1',
        matiere: 'levure',
        quantite: 12.5,
        jour: '2026-11-20',
      });
      recue = await receptionner.result.current.mutateAsync({
        commande: 'BC-007',
        quantite: 6,
        observation: 'Sacs abîmés',
        prix: 1500,
      });
      await relancer.result.current.mutateAsync({ commande: 'BC-006' });
      await replanifier.result.current.mutateAsync({ commande: 'BC-006' });
    });
    expect(planifiee8).toMatchObject({ commande: { numero: 'BC-008' } });
    expect(recue).toMatchObject({ commande: { statut: 'partielle' } });
    expect(recus).toEqual([
      {
        chemin: 'planifier',
        corps: { fournisseur: 1, matiere: 'levure', quantite: '12.5', prevue_le: '2026-11-20' },
      },
      {
        chemin: 'receptionner',
        corps: { quantite: '6', observation: 'Sacs abîmés', prix_unitaire: 1500 },
      },
      { chemin: 'relancer', corps: null },
      { chemin: 'replanifier', corps: { prevue_le: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } },
    ]);
  });

  it('un bon inconnu est refusé sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleFournisseurs('Willy'), { commandes: [], jours: [] });
    const { result } = renderHook(() => useRelancer('Willy'), { wrapper: wrapper(client) });
    await expect(result.current.mutateAsync({ commande: 'BC-099' })).rejects.toMatchObject({
      code: 'commande_inconnue',
    });
  });
});
