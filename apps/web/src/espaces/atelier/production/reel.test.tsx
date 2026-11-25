import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { actionsDe, cleProduction } from './api.ts';
import {
  etapeDe,
  lireProductionReelle,
  versConsommation,
  versDemandeProduction,
  versPlan,
  versRealise,
  derniereFourneeDe,
} from './reel.ts';
import type { InstantaneProduction } from './types.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const ligne = (code: string, champs: Record<string, unknown> = {}) => ({
  code,
  version_fiche: 1,
  pains_par_sac: 315,
  commandes: 0,
  habituels: 0,
  guichet: 0,
  estimee: 0,
  base: 0,
  supplement: 0,
  besoin: 0,
  au_dessus_du_plan: false,
  sacs: 0,
  prevus: 0,
  boules: 0,
  moyenne_sacs: null,
  ...champs,
});
const PLAN = {
  jour: '2026-11-13',
  creneau: 'jour',
  statut: 'valide',
  motif_supplement: '',
  propose_par: 'Serge Production',
  propose_le: '2026-11-13T05:10:00+01:00',
  valide_par: 'Willy Gérant',
  valide_le: '2026-11-13T05:40:00+01:00',
  validation_auto: false,
  alerte: false,
  farine_en_stock: '10.000',
  lignes: [
    ligne('BAG', { commandes: 170, estimee: 170, base: 1, sacs: 1, prevus: 315, boules: 16 }),
    ligne('KO', { commandes: 15, estimee: 15, base: 1, sacs: 1, prevus: 426, boules: 22 }),
    ligne('GC135', {
      commandes: 8,
      estimee: 8,
      base: 1,
      sacs: 1,
      prevus: 216,
      boules: 11,
      supplement: 1,
    }),
    ligne('PL'),
  ],
};
const EN_COURS = {
  id: 9,
  jour: '2026-11-13',
  creneau: 'jour',
  statut: 'en_cours',
  produits: [
    { code: 'BAG', sacs: 1, prevus: 315, realise: 200, reste: 115 },
    { code: 'KO', sacs: 1, prevus: 426, realise: 0, reste: 426 },
  ],
  consommation: [
    { matiere: 'farine', theorique: '50.000', reelle: '49.500', justification: '' },
    { matiere: 'sel', theorique: '1.000', reelle: null, justification: '' },
    { matiere: 'eau', theorique: '30.000', reelle: '30.000', justification: '' },
  ],
  prevus: 741,
  realise: 200,
  reste: 541,
  ouverte_par: 'Serge Production',
  ouverte_le: '2026-11-13T06:10:00+01:00',
  cloturee_par: '',
  cloturee_le: null,
  tolerance_ecart_kg: 0.3,
  tolerance_ecart_pourcent: 2,
};
const PASSEES = [
  {
    id: 9,
    jour: '2026-11-13',
    creneau: 'jour',
    statut: 'en_cours',
    responsable: { id: 5, nom: 'Serge Production' },
    plan_valide_par: 'Willy Gérant',
    ouverte_le: '2026-11-13T06:10:00+01:00',
    cloturee_le: null,
    sacs: 3,
    prevus: 957,
    realise: 200,
    ecart_matiere_kg: null,
    motif_ecart: '',
  },
  {
    id: 8,
    jour: '2026-11-12',
    creneau: 'nuit',
    statut: 'cloturee',
    responsable: { id: 5, nom: 'Serge Production' },
    plan_valide_par: 'Willy Gérant',
    ouverte_le: '2026-11-12T20:00:00+01:00',
    cloturee_le: '2026-11-13T01:30:00+01:00',
    sacs: 2,
    prevus: 640,
    realise: 630,
    ecart_matiere_kg: '-0.500',
    motif_ecart: 'perte : sac percé',
  },
  {
    id: 7,
    jour: '2026-11-11',
    creneau: 'jour',
    statut: 'non_cloturee',
    responsable: { id: 5, nom: 'Serge Production' },
    plan_valide_par: '',
    ouverte_le: '2026-11-11T06:00:00+01:00',
    cloturee_le: null,
    sacs: 1,
    prevus: 300,
    realise: 0,
    ecart_matiere_kg: null,
    motif_ecart: '',
  },
];
const SEMAINE = {
  id: 1,
  code: 'S46',
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant' },
  production: { id: 5, nom: 'Serge Production' },
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurProduction(options: { enCours?: boolean } = { enCours: true }) {
  serveur.use(
    http.get('*/api/v1/productions/plan/', () => HttpResponse.json(PLAN)),
    http.get('*/api/v1/productions/en-cours/', () =>
      options.enCours
        ? HttpResponse.json(EN_COURS)
        : HttpResponse.json({ detail: 'x', code: 'production_inconnue' }, { status: 404 }),
    ),
    http.get('*/api/v1/productions/', ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('semaine') === '1' ? page(PASSEES) : page([]),
      ),
    ),
    http.get('*/api/v1/productions/reste-a-produire/', () =>
      HttpResponse.json({
        jour: '2026-11-13',
        creneau: 'jour',
        statut: null,
        produits: [],
        reste: 0,
        fournees: [],
        mis_a_jour: null,
        rafraichir_secondes: 15,
      }),
    ),
    http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE]))),
    http.get('*/api/v1/commandes/', () => HttpResponse.json([{ id: 1 }, { id: 2 }])),
    http.get('*/api/v1/mouvements-stock/stock/', () =>
      HttpResponse.json({ quantites: { farine: '100.000', sel: '5.000', bois: '30.000' } }),
    ),
    http.get('*/api/v1/demandes/', () =>
      HttpResponse.json(
        page([
          {
            id: 4,
            numero: 4,
            type: 'supplement',
            statut: 'en_attente',
            details: { sacs: { BAG: 2, GC135: 1 }, motif: 'guichet' },
          },
          { id: 5, numero: 5, type: 'supplement', statut: 'accordee', details: {} },
        ]),
      ),
    ),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({
        jour: '2026-11-13',
        creneau: 'jour',
        planifiee: { id: 4, nom: 'Davy Caisse' },
        fonds_propose: 20000,
        caisse_en_cours: null,
      }),
    ),
  );
}

describe('lecture de la production sur le vrai serveur', () => {
  it('compose le cycle, le plan, la demande estimée, le réalisé et la consommation', async () => {
    serveurProduction();
    const i = await lireProductionReelle();
    expect(i.session).toEqual({ type: 'jour', date: '2026-11-13' });
    expect(i.etape).toBe('en-cours');
    expect(i.semaine).toEqual({ numero: 46, du: '2026-11-09', au: '2026-11-15' });
    expect(i.gerant).toBe('Willy Gérant');
    expect(i.responsable).toBe('Serge Production');
    expect(i.caissiere).toBe('Davy Caisse');
    expect(i.clientsCommandes).toBe(2);
    expect(i.planValide).toEqual({ par: 'Willy Gérant', a: '05:40' });
    expect(i.plan.sacs).toBe(3);
    expect(i.plan.prevus).toBe(957);
    expect(i.plan.supplement).toBe(1);
    expect(i.plan.lignes.GC).toMatchObject({ pains: 8, sacs: 1, supplement: 1, boules: 11 });
    expect(i.demande.BAG).toMatchObject({ commande: 170, estimee: 170, prevus: 315 });
    expect(i.realise).toEqual({ BAG: 200, KO: null, GC: null });
    // L'eau n'est pas une matière suivie.
    expect(i.consommation).toMatchObject({ farine: 49.5, sel: null });
    expect(i.consommation).not.toHaveProperty('eau');
    // Le stock est dans l'unité du serveur : la farine en kg (100), pas en sacs.
    expect(i.stock.farine).toBe(100);
    expect(i.productionId).toBe('9');
    expect(i.demandeEnAttente).toMatchObject({ id: '4', numero: 4, total: 3, motif: 'guichet' });
    // Jalons du cycle et tolérance, tels que le serveur les donne.
    expect(i.planPropose).toEqual({ par: 'Serge Production', a: '05:10' });
    expect(i.ouverte).toEqual({ par: 'Serge Production', a: '06:10' });
    expect(i.cloturee).toBeNull();
    expect(i.seuilEcartKg).toBe(0.3);
    // Historique : la production en cours est exclue (déjà affichée), les plus anciennes d'abord.
    expect(i.historique.map((h) => h.id)).toEqual(['7', '8']);
    expect(i.historique[1]).toEqual({
      id: '8',
      date: '2026-11-12',
      type: 'nuit',
      responsable: 'Serge Production',
      validePar: 'Willy Gérant',
      ouvertA: '20:00',
      clotureA: '01:30',
      sacs: 2,
      prevus: 640,
      realise: 630,
      ecartKg: -0.5,
      statut: 'cloturee',
      motif: 'perte',
    });
    expect(i.historique[0]).toMatchObject({ statut: 'non-cloturee', realise: null, clotureA: '—' });
  });

  it('sans production ouverte : plan validé, pas encore en cours', async () => {
    serveurProduction({ enCours: false });
    const i = await lireProductionReelle();
    expect(i.etape).toBe('plan-valide');
    expect(i.productionId).toBeUndefined();
    expect(i.ouverte).toBeNull();
    expect(i.realise).toEqual({ BAG: null, KO: null, GC: null });
  });

  it('les étapes du cycle', () => {
    expect(etapeDe(null, undefined)).toBe('commandes');
    expect(etapeDe('propose', undefined)).toBe('plan-propose');
    expect(etapeDe('valide', undefined)).toBe('plan-valide');
    expect(etapeDe('provisoire', undefined)).toBe('plan-valide');
    expect(etapeDe('valide', 'en_cours')).toBe('en-cours');
    expect(etapeDe('valide', 'cloturee')).toBe('cloturee');
    expect(etapeDe('valide', 'non_cloturee')).toBe('cloturee');
  });

  it('plan sans ligne, réalisé, consommation et demande hors supplément', () => {
    expect(versPlan([]).plan).toMatchObject({ sacs: 0, prevus: 0 });
    expect(versRealise([])).toEqual({ BAG: null, KO: null, GC: null });
    // Prévu 0 : rien à produire, donc rien à saisir ; prévu > 0 sans réalisé : à saisir.
    expect(
      versRealise([
        { code: 'BAG', sacs: 1, prevus: 315, realise: 0, reste: 315 },
        { code: 'GC135', sacs: 0, prevus: 0, realise: 0, reste: 0 },
      ]),
    ).toEqual({ BAG: null, KO: null, GC: 0 });
    expect(versConsommation([]).farine).toBeNull();
    expect(
      versDemandeProduction({
        id: 1,
        numero: 1,
        type: 'depense',
        statut: 'en_attente',
        details: {},
      } as never),
    ).toBeUndefined();
  });
});

describe('écritures de la production sur le vrai serveur', () => {
  const instantane = (champs: Partial<InstantaneProduction> = {}) =>
    ({
      session: { type: 'jour', date: '2026-11-13' },
      realise: { BAG: 200, KO: null, GC: null },
      productionId: '9',
      ...champs,
    }) as unknown as InstantaneProduction;

  it('propose, valide et ouvre sur la session que le plan désigne', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    const recus: { chemin: string; corps: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/productions/:action/', async ({ request, params }) => {
        recus.push({ chemin: String(params.action), corps: await request.json() });
        return HttpResponse.json(PLAN);
      }),
    );
    const actions = actionsDe(client, 'Serge');
    await actions.proposerLePlan();
    await actions.validerLePlan();
    await actions.ouvrir();
    const session = { jour: '2026-11-13', creneau: 'jour' };
    expect(recus).toEqual([
      { chemin: 'proposer', corps: session },
      { chemin: 'valider', corps: session },
      { chemin: 'ouvrir', corps: session },
    ]);
  });

  it('le réalisé saisi devient des fournées : seulement ce qui s’ajoute au réalisé du serveur', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    const fournees: unknown[] = [];
    serveur.use(
      http.post('*/api/v1/productions/9/fournee/', async ({ request }) => {
        fournees.push(await request.json());
        return HttpResponse.json(EN_COURS);
      }),
    );
    await actionsDe(client, 'Serge').enregistrerLeRealise({ BAG: 260, KO: 100, GC: 50 });
    expect(fournees).toEqual([
      { produit: 'BAG', pains: 60 },
      { produit: 'KO', pains: 100 },
      { produit: 'GC135', pains: 50 },
    ]);
  });

  it('annuler la dernière fournée : DELETE sur son numéro, puis relecture', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    let numero = '';
    serveur.use(
      http.delete('*/api/v1/productions/9/fournee/:numero/', ({ params }) => {
        numero = String(params.numero);
        return HttpResponse.json(EN_COURS);
      }),
    );
    await actionsDe(client, 'Serge').annulerLaDerniereFournee(3);
    expect(numero).toBe('3');
  });

  it('la dernière fournée est celle de plus grand numéro, dans les codes de l’écran', () => {
    expect(derniereFourneeDe([])).toBeNull();
    expect(
      derniereFourneeDe([
        { numero: 1, produit: 'BAG', pains: 100, saisie_le: '2026-11-13T07:00:00+01:00' },
        { numero: 2, produit: 'GC135', pains: 50, saisie_le: '2026-11-13T07:30:00+01:00' },
      ]),
    ).toEqual({ numero: 2, produit: 'GC', pains: 50, a: '07:30' });
  });

  it('enregistre la consommation et la justifie par matière', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    const corps: unknown[] = [];
    serveur.use(
      http.put('*/api/v1/productions/9/consommation/', async ({ request }) => {
        corps.push(await request.json());
        return HttpResponse.json(EN_COURS);
      }),
    );
    const actions = actionsDe(client, 'Serge');
    const consommation = { farine: 49.5, sel: null } as never;
    await actions.enregistrerLaConsommation(consommation);
    await actions.justifier({ motif: 'perte', texte: 'Sac percé', consommation });
    expect(corps[0]).toEqual({ quantites: { farine: '49.5' } });
    expect(corps[1]).toEqual({
      quantites: { farine: '49.5' },
      justifications: { farine: 'perte : Sac percé' },
    });
  });

  it('clôture : fournées, consommation, puis clôture ; les sorties de stock reviennent', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    const appels: string[] = [];
    serveur.use(
      http.post('*/api/v1/productions/9/fournee/', () => {
        appels.push('fournee');
        return HttpResponse.json(EN_COURS);
      }),
      http.put('*/api/v1/productions/9/consommation/', () => {
        appels.push('consommation');
        return HttpResponse.json(EN_COURS);
      }),
      http.post('*/api/v1/productions/9/cloturer/', () => {
        appels.push('cloturer');
        return HttpResponse.json({ ...EN_COURS, statut: 'cloturee' });
      }),
    );
    const reponse = await actionsDe(client, 'Serge').cloturer({
      realise: { BAG: 300, KO: null, GC: null },
      consommation: { farine: 49.5, sel: null } as never,
    });
    expect(appels).toEqual(['fournee', 'consommation', 'cloturer']);
    expect(reponse.sorties).toEqual([{ matiere: 'farine', quantite: 49.5 }]);
  });

  it('un supplément envoie les sacs en codes serveur ; la demande revient au-delà du seuil', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/productions/supplement/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ id: 1, statut: 'demande', demande: 'DEM-004' }, { status: 201 });
      }),
    );
    const reponse = await actionsDe(client, 'Serge').ajouterUnSupplement({
      sacs: { BAG: 2, KO: 0, GC: 1 },
      motif: 'guichet',
    });
    expect(corps).toEqual({
      jour: '2026-11-13',
      creneau: 'jour',
      supplement: { BAG: 2, KO: 0, GC135: 1 },
      motif: 'guichet',
    });
    expect(reponse.demande).toEqual({ id: 'DEM-004', numero: 4 });
  });

  it('une justification envoyée est retenue : relue avec la production et redite à chaque saisie', async () => {
    serveurProduction();
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane());
    const corps: { justifications?: Record<string, string> }[] = [];
    serveur.use(
      http.put('*/api/v1/productions/9/consommation/', async ({ request }) => {
        corps.push((await request.json()) as never);
        return HttpResponse.json(EN_COURS);
      }),
    );
    const actions = actionsDe(client, 'Serge');
    const consommation = { farine: 258, sel: 3100 } as never;
    await actions.justifier({ motif: 'perte', texte: 'Sac éventré', consommation });
    // Le serveur ne renvoie pas la justification : l'écran la relit de sa mémoire.
    expect((await lireProductionReelle()).justification).toEqual({
      motif: 'perte',
      texte: 'Sac éventré',
    });
    // Une saisie ultérieure (consommation ou clôture) redit la justification : pas de refus R10.
    await actions.enregistrerLaConsommation(consommation);
    expect(corps[1]?.justifications).toEqual({
      farine: 'perte : Sac éventré',
      sel: 'perte : Sac éventré',
    });
  });

  it('sans production ouverte, réalisé et clôture sont refusés sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleProduction('Serge'), instantane({ productionId: undefined }));
    const actions = actionsDe(client, 'Serge');
    await expect(
      actions.enregistrerLeRealise({ BAG: 1, KO: null, GC: null }),
    ).rejects.toMatchObject({
      code: 'production_inconnue',
    });
    await expect(
      actions.cloturer({ realise: { BAG: 1, KO: null, GC: null }, consommation: {} as never }),
    ).rejects.toMatchObject({ code: 'production_inconnue' });
  });
});
