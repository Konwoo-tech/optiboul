import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  clePersonnel,
  useAjouterLigne,
  useCreerEmploye,
  useModifierLigne,
  usePayer,
  usePayerLesRestes,
  usePreparer,
  useRetirerLigne,
  useSoumettre,
} from './api.ts';
import { jourDePaieDuMois, lirePersonnelReel, versCalendrier } from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

const MOIS = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' })
  .format(new Date())
  .slice(0, 7);

// Formes de réponse du vrai serveur (apps/api).
const LIGNE = {
  id: 5,
  employe: 'Aïcha Boulangère',
  base: 130000,
  absences: '1.0',
  montant_absences: 5000,
  avances: 10000,
  penalites: 2000,
  gains: 4000,
  elements: [
    {
      id: 8,
      genre: 'gain',
      description: 'Prime',
      montant: 4000,
      jour: `${MOIS}-03`,
      auteur: 'Willy',
    },
    {
      id: 9,
      genre: 'penalite',
      description: 'Retard',
      montant: 2000,
      jour: `${MOIS}-04`,
      auteur: 'Willy',
    },
  ],
  impaye: 0,
  net: 117000,
  paye: 20000,
  reste: 97000,
  paiements: [
    {
      id: 1,
      montant: 20000,
      mode: 'mobile',
      reference: 'MP1',
      depense: 4,
      paye_par: 'Willy',
      paye_le: `${MOIS}-10T09:00:00+01:00`,
    },
  ],
};
const ETAT = (statut: string, mois = MOIS) => ({
  id: 3,
  mois: `${mois}-01`,
  statut,
  total_net: 117000,
  lignes: [LIGNE],
});
const DEMANDE = {
  id: 21,
  numero: 21,
  type: 'paie',
  objet_id: 3,
  statut: 'en_attente',
  emetteur: { nom: 'Willy Gérant' },
  decide_par_nom: '',
  decide_le: null,
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurPaie(etats: unknown[], demandes: unknown[] = []) {
  serveur.use(
    http.get('*/api/v1/paies/', () => HttpResponse.json(page(etats))),
    http.get('*/api/v1/employes/', () =>
      HttpResponse.json(
        page([
          {
            id: 1,
            nom: 'Aïcha Boulangère',
            poste: 'Boulangère',
            salaire_base: 130000,
            actif: true,
          },
          { id: 2, nom: 'Paul Livreur', poste: 'Livreur', salaire_base: 80000, actif: true },
        ]),
      ),
    ),
    http.get('*/api/v1/demandes/', () => HttpResponse.json(page(demandes))),
    http.get('*/api/v1/parametres/', () =>
      HttpResponse.json([{ cle: 'jour_de_paie', valeur: 5, choix: [5, 10, 15] }]),
    ),
  );
}

describe('lecture du personnel et de la paie sur le vrai serveur', () => {
  it('compose l’état du mois : lignes, ajustements, paiements, demande en attente', async () => {
    serveurPaie([ETAT('soumis')], [DEMANDE]);
    const i = await lirePersonnelReel();
    expect(i).toMatchObject({
      mois: MOIS,
      statut: 'soumis',
      etat: 3,
      jourDePaie: `${MOIS}-05`,
      joursPossibles: [`${MOIS}-05`, `${MOIS}-10`, `${MOIS}-15`],
      soumisPar: 'Willy Gérant',
      demande: { id: '21', numero: 21 },
    });
    expect(i.employes).toEqual([
      {
        id: '5',
        nom: 'Aïcha Boulangère',
        poste: 'Boulangère',
        base: 130000,
        absences: 1,
        avances: 10000,
        impaye: 0,
        ajustements: [
          {
            id: '8',
            type: 'gain',
            libelle: 'Prime',
            montant: 4000,
            date: `${MOIS}-03`,
            par: 'Willy',
          },
          {
            id: '9',
            type: 'penalite',
            libelle: 'Retard',
            montant: 2000,
            date: `${MOIS}-04`,
            par: 'Willy',
          },
        ],
        paiements: [
          { montant: 20000, mode: 'mobile', reference: 'MP1', date: `${MOIS}-10`, par: 'Willy' },
        ],
      },
    ]);
    expect(i.aPreparer).toBeUndefined();
  });

  it('sans état pour le mois : une ligne par employé actif et le mois à préparer', async () => {
    serveurPaie([ETAT('payee', '2020-01')]);
    const i = await lirePersonnelReel();
    expect(i.aPreparer).toBe(MOIS);
    expect(i.etat).toBeUndefined();
    expect(i.employes.map((e) => [e.nom, e.base])).toEqual([
      ['Aïcha Boulangère', 130000],
      ['Paul Livreur', 80000],
    ]);
    expect(i.calendrier.at(-1)).toMatchObject({ mois: MOIS, statut: 'planifiee' });
  });

  it('état validé : le valideur et son heure viennent de la demande accordée', async () => {
    serveurPaie(
      [ETAT('en_paiement')],
      [
        {
          ...DEMANDE,
          statut: 'accordee',
          decide_par_nom: 'Patron Dev',
          decide_le: `${MOIS}-02T10:30:00+01:00`,
        },
      ],
    );
    const i = await lirePersonnelReel();
    expect(i).toMatchObject({
      statut: 'en-paiement',
      validePar: 'Patron Dev',
      valideA: '10:30',
      demande: null,
    });
  });

  it('le calendrier et le jour de paie', () => {
    expect(jourDePaieDuMois('2026-02', 31)).toBe('2026-02-28');
    const mois = versCalendrier(
      [ETAT('payee', '2026-09'), ETAT('soumis', '2026-10')] as never,
      '2026-11',
      5,
      '2026-11',
    );
    expect(mois.map((m) => [m.mois, m.statut])).toEqual([
      ['2026-09', 'payee'],
      ['2026-10', 'partielle'],
      ['2026-11', 'planifiee'],
    ]);
    expect(mois[1]).toMatchObject({ total: 20000, impayes: 97000 });
  });
});

describe('actions sur le vrai serveur', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

  it('prépare, ajuste, soumet et paie avec les identifiants du serveur', async () => {
    serveurPaie([ETAT('valide')]);
    const client = new QueryClient();
    client.setQueryData(clePersonnel('Willy'), await lirePersonnelReel());
    const recus: { chemin: string; corps: unknown; cle?: string | null }[] = [];
    const noter =
      (chemin: string, reponse: unknown, statut = 200) =>
      async ({ request }: { request: Request }) => {
        const texte = await request.text();
        recus.push({
          chemin,
          corps: texte ? JSON.parse(texte) : null,
          ...(request.headers.get('Idempotency-Key') ? { cle: 'oui' } : {}),
        });
        return reponse === null
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json(reponse as never, { status: statut });
      };
    serveur.use(
      http.post('*/api/v1/paies/preparer/', noter('preparer', ETAT('brouillon'), 201)),
      http.post('*/api/v1/paies/lignes/5/elements/', noter('element', LIGNE.elements[0], 201)),
      http.delete('*/api/v1/paies/elements/8/', noter('retirer', null)),
      http.post('*/api/v1/paies/3/soumettre/', noter('soumettre', { demande: 'DEM-021' })),
      http.post(
        '*/api/v1/paies/lignes/5/payer/',
        noter('payer', { ...LIGNE.paiements[0], depense: 44 }, 201),
      ),
      http.post('*/api/v1/paies/3/payer-tout/', noter('payer-tout', { payes: 2 })),
    );
    const w = wrapper(client);
    const preparer = renderHook(() => usePreparer('Willy'), { wrapper: w });
    const ajouter = renderHook(() => useAjouterLigne('Willy'), { wrapper: w });
    const retirer = renderHook(() => useRetirerLigne('Willy'), { wrapper: w });
    const soumettre = renderHook(() => useSoumettre('Willy'), { wrapper: w });
    const payer = renderHook(() => usePayer('Willy'), { wrapper: w });
    const tout = renderHook(() => usePayerLesRestes('Willy'), { wrapper: w });
    let retourPaiement: unknown;
    let retourTout: unknown;
    await act(async () => {
      await preparer.result.current.mutateAsync(MOIS);
      await ajouter.result.current.mutateAsync({
        employe: '5',
        type: 'gain',
        libelle: 'Prime',
        montant: 4000,
      });
      await retirer.result.current.mutateAsync('8');
      await soumettre.result.current.mutateAsync();
      retourPaiement = await payer.result.current.mutateAsync({
        employe: '5',
        mode: 'mobile',
        montant: 50000,
        reference: 'MP2',
      });
      retourTout = await tout.result.current.mutateAsync({ mode: 'especes' });
    });
    expect(recus).toEqual([
      { chemin: 'preparer', corps: { mois: `${MOIS}-01` } },
      { chemin: 'element', corps: { genre: 'gain', description: 'Prime', montant: 4000 } },
      { chemin: 'retirer', corps: null },
      { chemin: 'soumettre', corps: null },
      { chemin: 'payer', corps: { montant: 50000, mode: 'mobile', reference: 'MP2' }, cle: 'oui' },
      { chemin: 'payer-tout', corps: { mode: 'especes' }, cle: 'oui' },
    ]);
    expect(retourPaiement).toMatchObject({ depenses: ['44'] });
    expect((retourTout as { depenses: string[] }).depenses).toHaveLength(2);
  });

  it('enregistre les absences et les avances d’une ligne', async () => {
    serveurPaie([ETAT('brouillon')]);
    const client = new QueryClient();
    client.setQueryData(clePersonnel('Willy'), await lirePersonnelReel());
    let corps: unknown;
    serveur.use(
      http.put('*/api/v1/paies/lignes/5/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json(LIGNE);
      }),
    );
    const { result } = renderHook(() => useModifierLigne('Willy'), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ employe: '5', absences: 1.5, avances: 10000 });
    });
    expect(corps).toEqual({ absences: '1.5', avances: 10000 });
  });

  it('crée un employé avec son salaire de base', async () => {
    let corps: unknown;
    serveur.use(
      http.post('*/api/v1/employes/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ id: 9, nom: 'Nadia', salaire_base: 70000 }, { status: 201 });
      }),
    );
    const { result } = renderHook(() => useCreerEmploye('Willy'), {
      wrapper: wrapper(new QueryClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({
        nom: 'Nadia',
        poste: 'Caissière',
        telephone: '699',
        base: 70000,
      });
    });
    expect(corps).toEqual({
      nom: 'Nadia',
      poste: 'Caissière',
      telephone: '699',
      salaire_base: 70000,
    });
  });

  it('sans état lu, l’action est refusée sans appeler le serveur', async () => {
    const { result } = renderHook(() => useSoumettre('Willy'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: 'etat_inconnu' });
  });
});
