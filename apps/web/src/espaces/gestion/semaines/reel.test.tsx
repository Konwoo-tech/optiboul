import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  cleSemaines,
  useAffecter,
  useCloturerDeForce,
  useCloturerSemaine,
  useOuvrirSemaine,
  usePlanifier,
} from './api.ts';
import {
  indicateursDeLaSemaine,
  lireSemainesReelles,
  passationPrevue,
  versControles,
  versCreneau,
  versPlanning,
  versSemaine,
} from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const SEMAINE = {
  id: 1,
  code: 'S46',
  annee: 2026,
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant', profil: 'gerant' },
  production: { id: 5, nom: 'Serge Production', profil: 'production' },
  planifiee_par: 'Patron Dev',
  ouverte_le: '2026-11-13T02:06:13+01:00',
  ouverte_par: 'Patron Dev',
  cloturee_le: null,
  cloturee_par: '',
};
const PLANIFIEE = {
  ...SEMAINE,
  id: 2,
  code: 'S47',
  numero: 47,
  du: '2026-11-16',
  au: '2026-11-22',
  statut: 'planifiee',
  ouverte_le: null,
  ouverte_par: '',
};
const DAVY = { id: 4, nom: 'Davy Caisse' };
const CAISSE = {
  id: 2,
  semaine: 1,
  jour: '2026-11-13',
  creneau: 'jour',
  caissiere: DAVY,
  fonds: 20000,
  attendu: 21600,
  compte: 21000,
  ecart: -600,
  statut: 'fermee',
  en_cours: false,
  ouverte_le: '2026-11-13T08:09:00+01:00',
  fermee_le: '2026-11-13T18:00:00+01:00',
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurSemaines() {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        url: 'http://localhost/api/v1/users/2/',
        name: 'Patron Dev',
        profil: 'proprietaire',
      }),
    ),
    http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE, PLANIFIEE]))),
    http.get('*/api/v1/semaines/:id/planning/', ({ params }) =>
      HttpResponse.json({
        creneaux: [
          { jour: '2026-11-13', creneau: 'jour', caissiere: params.id === '1' ? DAVY : null },
          { jour: '2026-11-13', creneau: 'nuit', caissiere: null },
        ],
        vides: [],
        conflits: [],
      }),
    ),
    http.get('*/api/v1/caisses/', () => HttpResponse.json(page([CAISSE]))),
    http.get('*/api/v1/depenses/', () =>
      HttpResponse.json(
        page([
          { id: 1, semaine: 1, montant: 8000, statut: 'validee' },
          { id: 2, semaine: 1, montant: 60000, statut: 'en_attente' },
        ]),
      ),
    ),
    http.get('*/api/v1/connexion/utilisateurs/', () =>
      HttpResponse.json([
        { id: 3, nom: 'Willy Gérant', profil: 'gerant' },
        { id: 6, nom: 'Rachel Gérante', profil: 'gerant' },
        { id: 5, nom: 'Serge Production', profil: 'production' },
        { id: 4, nom: 'Davy Caisse', profil: 'caissier' },
      ]),
    ),
    http.get('*/api/v1/clients/dettes/', () =>
      HttpResponse.json({ nombre: 7, total: 16250, clients: [] }),
    ),
    http.get('*/api/v1/mouvements-stock/etat/', () =>
      HttpResponse.json([
        {
          matiere: 'glace',
          quantite: '0',
          valeur: 0,
          besoin_par_session: '0',
          statut: 'stock_bas',
        },
        { matiere: 'farine', quantite: '100', valeur: 1, besoin_par_session: '0', statut: 'ok' },
      ]),
    ),
    http.get('*/api/v1/semaines/1/controles-cloture/', () =>
      HttpResponse.json([
        {
          cle: 'caisse',
          niveau: 'bloquant',
          detail: 'La caisse de jour du 13/11 est encore ouverte.',
          session: { type: 'jour', jour: '2026-11-13', par: 'Davy Caisse', heure: '08:09' },
        },
        { cle: 'dettes_clients', niveau: 'surveiller', detail: '', clients: 7, total: 16250 },
        { cle: 'production', niveau: 'ok', detail: '' },
      ]),
    ),
  );
}

describe('lecture des semaines sur le vrai serveur', () => {
  it('compose semaines, planning, créneaux, indicateurs, personnes et contrôles de clôture', async () => {
    serveurSemaines();
    const i = await lireSemainesReelles();
    expect(i.moi).toEqual({ id: '2', nom: 'Patron Dev', profil: 'proprietaire' });
    // La plus récente d'abord.
    expect(i.semaines.map((s) => [s.id, s.statut, s.idServeur])).toEqual([
      ['S47', 'planifiee', 2],
      ['S46', 'ouverte', 1],
    ]);
    expect(i.semaines[1]).toMatchObject({
      numero: 46,
      gerant: { id: '3', nom: 'Willy Gérant', profil: 'gerant' },
      production: { id: '5', nom: 'Serge Production' },
      planifieePar: 'Patron Dev',
      ouverture: { par: 'Patron Dev', jour: '2026-11-13', heure: '02:06' },
      cloture: null,
    });
    expect(i.planning.S46?.['2026-11-13']).toEqual({ jour: '4', nuit: '' });
    expect(i.planning.S47?.['2026-11-13']).toEqual({ jour: '', nuit: '' });
    expect(i.gerants.map((p) => p.nom)).toEqual(['Willy Gérant', 'Rachel Gérante']);
    expect(i.responsables.map((p) => p.nom)).toEqual(['Serge Production']);
    expect(i.caissieres.map((p) => p.nom)).toEqual(['Davy Caisse']);
    expect(i.creneaux).toEqual([
      {
        jour: '2026-11-13',
        type: 'jour',
        caissiere: { id: '4', nom: 'Davy Caisse', profil: 'caissier' },
        ouverture: '08:09',
        fermeture: '18:00',
        ecart: -600,
        enCours: false,
      },
    ]);
    expect(i.indicateurs.S46).toMatchObject({
      depenses: { nombre: 1, montant: 8000 },
      ecartCumule: -600,
      caisses: 1,
    });
    expect(i.clotures.S46?.controles.map((c) => [c.cle, c.niveau])).toEqual([
      ['caisse', 'bloquant'],
      ['dettes', 'surveiller'],
      ['production', 'ok'],
    ]);
    expect(i.clotures.S46?.passation).toMatchObject({
      numeroSuivante: 47,
      dettes: { clients: -16250 },
      stockBas: ['glace'],
      caisses: { derniere: { jour: '2026-11-13', par: 'Davy Caisse', compte: 21000 } },
    });
    // Seule la semaine ouverte a des contrôles de clôture.
    expect(i.clotures.S47).toBeUndefined();
  });

  it('sans la liste du poste de confiance, les personnes déjà affectées restent proposées', async () => {
    serveurSemaines();
    serveur.use(
      http.get('*/api/v1/connexion/utilisateurs/', () =>
        HttpResponse.json({ detail: 'x', code: 'poste_non_reconnu' }, { status: 403 }),
      ),
    );
    const i = await lireSemainesReelles();
    expect(i.gerants.map((p) => p.nom)).toEqual(['Willy Gérant']);
    expect(i.responsables.map((p) => p.nom)).toEqual(['Serge Production']);
    expect(i.caissieres).toEqual([]);
  });

  it('les conversions : semaine, créneau, planning, contrôles inconnus écartés', () => {
    expect(versSemaine({ ...SEMAINE, statut: 'inconnu' } as never).statut).toBe('planifiee');
    expect(
      versCreneau({ ...CAISSE, en_cours: true, fermee_le: null, ecart: null } as never),
    ).toMatchObject({ fermeture: null, ecart: null, enCours: true });
    expect(versPlanning([])).toEqual({});
    expect(versControles([{ cle: 'autre', niveau: 'ok' }], 'Serge')).toEqual([]);
    expect(
      versControles(
        [
          { cle: 'factures_en_retard', niveau: 'surveiller' },
          { cle: 'demandes_en_attente', niveau: 'ok' },
        ],
        'Serge',
      ),
    ).toEqual([
      { cle: 'factures', niveau: 'surveiller', factures: [] },
      { cle: 'demandes', niveau: 'ok', numeros: [] },
    ]);
    expect(indicateursDeLaSemaine([], [])).toMatchObject({
      caisses: 0,
      depenses: { nombre: 0, montant: 0 },
    });
    expect(passationPrevue([], 0, [], 47, null).caisses.derniere).toBeNull();
  });
});

describe('affectations et planning sur le vrai serveur', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

  it('affecte un gérant en gardant le responsable de production, et place une caissière', async () => {
    serveurSemaines();
    const client = new QueryClient();
    client.setQueryData(cleSemaines('Patron Dev'), await lireSemainesReelles());
    const recus: { chemin: string; corps: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/semaines/2/affectations/', async ({ request }) => {
        recus.push({ chemin: 'affectations', corps: await request.json() });
        return HttpResponse.json({ semaine: PLANIFIEE, conflits: [] });
      }),
      http.put('*/api/v1/semaines/2/planning/', async ({ request }) => {
        recus.push({ chemin: 'planning', corps: await request.json() });
        return HttpResponse.json({ creneaux: [], vides: [], conflits: [] });
      }),
    );
    const w = wrapper(client);
    const affecter = renderHook(() => useAffecter('Patron Dev'), { wrapper: w });
    const planifier = renderHook(() => usePlanifier('Patron Dev'), { wrapper: w });
    await act(async () => {
      await affecter.result.current.mutateAsync({ semaine: 'S47', role: 'gerant', personne: '6' });
      await planifier.result.current.mutateAsync({
        semaine: 'S47',
        jour: '2026-11-16',
        creneau: 'nuit',
        caissiere: '4',
      });
      await planifier.result.current.mutateAsync({
        semaine: 'S47',
        jour: '2026-11-16',
        creneau: 'jour',
        caissiere: '',
      });
    });
    expect(recus).toEqual([
      // Le responsable de production n'a pas bougé : le serveur reçoit les deux.
      { chemin: 'affectations', corps: { gerant: 6, production: 5 } },
      { chemin: 'planning', corps: { jour: '2026-11-16', creneau: 'nuit', caissiere: 4 } },
      { chemin: 'planning', corps: { jour: '2026-11-16', creneau: 'jour', caissiere: null } },
    ]);
  });

  it('ouvre, clôture et force la clôture avec le motif', async () => {
    serveurSemaines();
    const client = new QueryClient();
    client.setQueryData(cleSemaines('Patron Dev'), await lireSemainesReelles());
    const recus: { chemin: string; corps: unknown }[] = [];
    serveur.use(
      http.post('*/api/v1/semaines/:id/:action/', async ({ params, request }) => {
        const texte = await request.text();
        recus.push({
          chemin: [params.id, params.action].join('/'),
          corps: texte ? JSON.parse(texte) : null,
        });
        return HttpResponse.json(SEMAINE);
      }),
    );
    const w = wrapper(client);
    const ouvrir = renderHook(() => useOuvrirSemaine('Patron Dev'), { wrapper: w });
    const cloturer = renderHook(() => useCloturerSemaine('Patron Dev'), { wrapper: w });
    const forcer = renderHook(() => useCloturerDeForce('Patron Dev'), { wrapper: w });
    await act(async () => {
      await ouvrir.result.current.mutateAsync({ semaine: 'S47' });
      await cloturer.result.current.mutateAsync({ semaine: 'S46' });
      await forcer.result.current.mutateAsync({ semaine: 'S46', motif: 'Panne de courant' });
    });
    expect(recus.map((r) => r.chemin)).toEqual(['2/ouvrir', '1/cloturer', '1/cloturer-forcee']);
    expect(recus[2]?.corps).toEqual({ motif: 'Panne de courant' });
  });

  it('une semaine inconnue est refusée sans appeler le serveur', async () => {
    const client = new QueryClient();
    client.setQueryData(cleSemaines('Patron Dev'), { semaines: [] });
    const { result } = renderHook(() => usePlanifier('Patron Dev'), { wrapper: wrapper(client) });
    await expect(
      result.current.mutateAsync({
        semaine: 'S99',
        jour: '2026-11-16',
        creneau: 'jour',
        caissiere: '4',
      }),
    ).rejects.toMatchObject({ code: 'semaine_inconnue' });
  });
});
