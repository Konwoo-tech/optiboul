import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { destinationDuLien, lireTableauDeBordReel, versAlerte, versProduction } from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const TABLEAU = {
  mois: '2026-11',
  indicateurs: {
    recette: 116200,
    ventes: 132450,
    taux_encaissement: 88,
    dettes_clients: 16250,
    dettes_fournisseurs: 5000,
    ecart_caisse_cumule: -600,
    marge_estimee: { matieres: 0, charges: 60000, marge: 56200 },
  },
  graphiques: {
    recette_par_session: [
      { jour: '2026-11-12', creneau: 'nuit', recette: 1600 },
      { jour: '2026-11-13', creneau: 'jour', recette: 114600 },
    ],
    production_par_produit: [
      { produit: 'GC135', pains: 940 },
      { code: 'BAG', total: 3000 },
    ],
    budget_par_categorie: [
      { categorie: 'matieres', budget: 900000, depense: 160000 },
      { categorie: 'petit_materiel', budget: 75000, depense: 0 },
    ],
  },
};
const ALERTES = [
  {
    type: 'stock_bas',
    niveau: 'bloquant',
    titre: 'Stock bas',
    detail: 'Glace, Huile',
    nombre: 2,
    lien: '/atelier/stocks',
  },
  {
    type: 'plafonds_depasses',
    niveau: 'surveiller',
    titre: 'Plafonds de dette dépassés',
    detail: 'Ebène',
    nombre: 3,
    lien: '/gestion/clients?statut=plafond_depasse',
  },
  {
    type: 'factures_en_retard',
    niveau: 'bloquant',
    titre: 'Factures en retard',
    detail: '',
    nombre: 2,
    lien: '/gestion/fournisseurs',
  },
];
const SEMAINE = {
  id: 1,
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant' },
  production: { id: 5, nom: 'Serge Production' },
};

describe('tableau de bord sur le vrai serveur', () => {
  it('compose indicateurs, dettes, semaine, graphiques et alertes', async () => {
    serveur.use(
      http.get('*/api/v1/tableau-de-bord/', () => HttpResponse.json(TABLEAU)),
      http.get('*/api/v1/alertes/', () => HttpResponse.json(ALERTES)),
      http.get('*/api/v1/clients/dettes/', () =>
        HttpResponse.json({ nombre: 5, total: 16250, clients: [] }),
      ),
      http.get('*/api/v1/semaines/', () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [SEMAINE] }),
      ),
    );
    const i = await lireTableauDeBordReel();
    expect(i.mois).toBe('2026-11');
    expect(i.recette).toEqual({ encaissee: 116200, due: 132450 });
    expect(i.dettesClients).toEqual({ montant: 16250, clients: 5, auDessusDuPlafond: 3 });
    expect(i.dettesFournisseurs).toEqual({ montant: 5000, facturesEnRetard: 2 });
    expect(i.semaine).toEqual({
      numero: 46,
      du: '2026-11-09',
      au: '2026-11-15',
      gerant: 'Willy Gérant',
      production: 'Serge Production',
    });
    expect(i.recettesParNuit).toEqual([
      { jour: '2026-11-12', montant: 1600 },
      { jour: '2026-11-13', montant: 114600 },
    ]);
    expect(i.production).toEqual([
      { produit: 'GC 135', pains: 940 },
      { produit: 'BAG', pains: 3000 },
    ]);
    // La marge estimée et le budget du mois, que le serveur donne en plus du prototype.
    expect(i.marge).toEqual({ matieres: 0, charges: 60000, marge: 56200 });
    expect(i.budget).toEqual([
      { categorie: 'matieres', budget: 900000, realise: 160000 },
      { categorie: 'petit-materiel', budget: 75000, realise: 0 },
    ]);
    expect(i.alertes.map((a) => [a.niveau, a.type])).toEqual([
      ['bloquant', 'serveur'],
      ['surveiller', 'serveur'],
      ['bloquant', 'serveur'],
    ]);
  });

  it('garde le tableau malgré le refus des alertes et des dettes (sans elles : 0 et aucune alerte)', async () => {
    serveur.use(
      http.get('*/api/v1/tableau-de-bord/', () => HttpResponse.json(TABLEAU)),
      http.get('*/api/v1/alertes/', () => HttpResponse.json({ detail: 'x' }, { status: 403 })),
      http.get('*/api/v1/clients/dettes/', () =>
        HttpResponse.json({ detail: 'x' }, { status: 403 }),
      ),
      http.get('*/api/v1/semaines/', () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    const i = await lireTableauDeBordReel();
    expect(i.alertes).toEqual([]);
    expect(i.dettesClients).toMatchObject({ clients: 0, auDessusDuPlafond: 0 });
    expect(i.semaine.numero).toBe(0);
  });

  it('un lien du serveur devient l’écran et son filtre', () => {
    expect(destinationDuLien('/gestion/clients?statut=plafond_depasse')).toEqual({
      espace: 'gestion',
      ecran: 'clients',
      parametres: { statut: 'plafond_depasse' },
    });
    expect(destinationDuLien('/atelier/stocks')).toEqual({ espace: 'atelier', ecran: 'stocks' });
    expect(destinationDuLien('').espace).toBe('gestion');
    expect(versAlerte(ALERTES[0] as never, 0)).toMatchObject({
      id: 'stock_bas-0',
      type: 'serveur',
      titre: 'Stock bas',
      detail: 'Glace, Huile',
      nombre: 2,
    });
    expect(versProduction([])).toEqual([]);
  });
});
