import { configurerApi, ErreurApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  useActiver,
  useChangerDeGroupe,
  useCreerUnGroupe,
  useCreerUtilisateur,
  useDebloquer,
  useReinitialiserLeCode,
} from './api.ts';
import {
  enErreurDeChamps,
  lireUtilisateursReels,
  telephoneDeLEcran,
  telephoneDuServeur,
} from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const COMPTE = (id: number, name: string, groupe: number, profil: string | null, extra = {}) => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/\W/g, '')}@gmail.com`,
  groupe,
  profil,
  telephone: '+237677412018',
  canal: 'sms',
  dernier_acces: '2026-11-24T08:50:00+01:00',
  is_active: true,
  bloque: false,
  bloque_jusqua: null,
  ...extra,
});
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurUtilisateurs() {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({ url: 'http://localhost/api/v1/users/1/', name: 'Admin Dev' }),
    ),
    http.get('*/api/v1/utilisateurs/', () =>
      HttpResponse.json(
        page([
          COMPTE(1, 'Admin Dev', 6, 'administrateur'),
          COMPTE(4, 'Davy Caisse', 2, 'caissier', { bloque: true }),
          COMPTE(8, 'Sans Groupe', 0, null),
        ]),
      ),
    ),
    http.get('*/api/v1/groupes/', () =>
      HttpResponse.json(
        page([
          {
            id: 2,
            nom: 'Caisse – équipe de jour',
            profil: 'caissier',
            description: '',
            membres: 1,
          },
          {
            id: 6,
            nom: 'Support informatique',
            profil: 'administrateur',
            description: 'IT',
            membres: 1,
          },
        ]),
      ),
    ),
  );
}

describe('lecture des utilisateurs sur le vrai serveur', () => {
  it('compose comptes (sans groupe écartés), groupes et la personne connectée', async () => {
    serveurUtilisateurs();
    const i = await lireUtilisateursReels();
    expect(i.moi).toBe('1');
    expect(i.utilisateurs.map((u) => [u.id, u.nom, u.profil, u.groupe, u.bloque])).toEqual([
      ['1', 'Admin Dev', 'administrateur', '6', false],
      ['4', 'Davy Caisse', 'caissier', '2', true],
    ]);
    expect(i.groupes).toEqual([
      { id: '2', nom: 'Caisse – équipe de jour', profil: 'caissier', description: '' },
      { id: '6', nom: 'Support informatique', profil: 'administrateur', description: 'IT' },
    ]);
  });

  it('les conversions : téléphone et refus de validation par champ', () => {
    expect(telephoneDuServeur('6 77 41 20 18')).toBe('+237677412018');
    const refus = enErreurDeChamps(
      new ErreurApi(400, {
        nom: ['Ce champ ne peut être vide.'],
        email: ['Cette adresse Gmail a déjà un compte.'],
        telephone: ['Numéro camerounais attendu'],
        groupe: ['Clé primaire non valide'],
      }),
    ) as ErreurApi;
    expect(refus.code).toBe('champs_invalides');
    expect(refus.details).toMatchObject({
      erreurs: {
        nom: 'nom_obligatoire',
        email: 'email_deja_utilise',
        telephone: 'telephone_invalide',
        groupe: 'groupe_obligatoire',
      },
    });
    const autre = new ErreurApi(403, { code: 'droit_insuffisant' });
    expect(enErreurDeChamps(autre)).toBe(autre);
  });
});

describe('actions sur le vrai serveur', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

  it('lit le téléphone, le canal du second facteur, le dernier accès et l’activation', async () => {
    serveurUtilisateurs();
    serveur.use(
      http.get('*/api/v1/utilisateurs/', () =>
        HttpResponse.json(
          page([
            COMPTE(4, 'Davy Caisse', 2, 'caissier', {
              is_active: false,
              canal: 'whatsapp',
              dernier_acces: null,
            }),
            COMPTE(5, 'Serge', 2, 'caissier'),
          ]),
        ),
      ),
    );
    const i = await lireUtilisateursReels();
    expect(i.utilisateurs[0]).toMatchObject({
      actif: false,
      canal: 'whatsapp',
      dernierAcces: '',
      telephone: '6 77 41 20 18',
    });
    expect(i.utilisateurs[1]).toMatchObject({
      actif: true,
      canal: 'sms',
      dernierAcces: '2026-11-24T08:50:00+01:00',
    });
    expect(telephoneDeLEcran('+237677412018')).toBe('6 77 41 20 18');
    expect(telephoneDeLEcran('')).toBe('');
  });

  it('crée un compte, change de groupe, réinitialise le code, débloque, crée un groupe', async () => {
    serveurUtilisateurs();
    const recus: { chemin: string; corps: unknown }[] = [];
    const noter =
      (chemin: string, reponse: unknown, statut = 200) =>
      async ({ request }: { request: Request }) => {
        const texte = await request.text();
        recus.push({ chemin, corps: texte ? JSON.parse(texte) : null });
        return reponse === null
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json(reponse as never, { status: statut });
      };
    serveur.use(
      http.post(
        '*/api/v1/utilisateurs/',
        noter(
          'creer',
          { ...COMPTE(9, 'Nadia', 2, 'caissier'), codesSecours: ['AAAA-1111', 'BBBB-2222'] },
          201,
        ),
      ),
      http.post(
        '*/api/v1/utilisateurs/4/groupe/',
        noter('groupe', COMPTE(4, 'Davy Caisse', 6, 'caissier')),
      ),
      http.post('*/api/v1/utilisateurs/4/reinitialiser-code/', noter('code', null)),
      http.post(
        '*/api/v1/utilisateurs/4/debloquer/',
        noter('debloquer', COMPTE(4, 'Davy Caisse', 2, 'caissier')),
      ),
      http.post(
        '*/api/v1/groupes/',
        noter(
          'groupes',
          { id: 9, nom: 'Nuit', profil: 'caissier', description: '', membres: 0 },
          201,
        ),
      ),
    );
    const w = wrapper(new QueryClient());
    const creer = renderHook(() => useCreerUtilisateur('Admin Dev'), { wrapper: w });
    const groupe = renderHook(() => useChangerDeGroupe('Admin Dev'), { wrapper: w });
    const code = renderHook(() => useReinitialiserLeCode('Admin Dev'), { wrapper: w });
    const debloquer = renderHook(() => useDebloquer('Admin Dev'), { wrapper: w });
    const nouveauGroupe = renderHook(() => useCreerUnGroupe('Admin Dev'), { wrapper: w });
    let reponse: unknown;
    await act(async () => {
      reponse = await creer.result.current.mutateAsync({
        nom: 'Nadia',
        email: 'nadia@gmail.com',
        telephone: '6 99 12 34 56',
        groupe: '2',
        canal: 'sms',
        invitation: true,
      });
      await groupe.result.current.mutateAsync({ id: '4', groupe: '6' });
      await code.result.current.mutateAsync({ id: '4' });
      await debloquer.result.current.mutateAsync('4');
      await nouveauGroupe.result.current.mutateAsync({
        nom: 'Nuit',
        profil: 'caissier',
        description: '',
      });
    });
    expect(reponse).toMatchObject({
      utilisateur: { id: '9', telephone: '6 99 12 34 56', canal: 'sms' },
      codesSecours: ['AAAA-1111', 'BBBB-2222'],
    });
    expect(recus).toEqual([
      {
        chemin: 'creer',
        corps: {
          nom: 'Nadia',
          email: 'nadia@gmail.com',
          telephone: '+237699123456',
          groupe: 2,
          canal: 'sms',
        },
      },
      { chemin: 'groupe', corps: { groupe: 6 } },
      // Le serveur génère le code et l'envoie : rien n'est transmis par l'écran.
      { chemin: 'code', corps: null },
      { chemin: 'debloquer', corps: null },
      { chemin: 'groupes', corps: { nom: 'Nuit', profil: 'caissier', description: '' } },
    ]);
  });

  it('un refus de validation du serveur devient une erreur par champ', async () => {
    serveurUtilisateurs();
    serveur.use(
      http.post('*/api/v1/utilisateurs/', () =>
        HttpResponse.json({ email: ['Adresse Gmail attendue (…@gmail.com).'] }, { status: 400 }),
      ),
    );
    const { result } = renderHook(() => useCreerUtilisateur('Admin Dev'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(
      result.current.mutateAsync({
        nom: 'X',
        email: 'x@yahoo.fr',
        telephone: '699123456',
        groupe: '2',
        canal: 'sms',
        invitation: false,
      }),
    ).rejects.toMatchObject({ code: 'champs_invalides' });
  });

  it('désactive puis réactive un compte (POST /utilisateurs/{id}/activation/)', async () => {
    serveurUtilisateurs();
    const corps: unknown[] = [];
    serveur.use(
      http.post('*/api/v1/utilisateurs/4/activation/', async ({ request }) => {
        corps.push(await request.json());
        return HttpResponse.json(COMPTE(4, 'Davy Caisse', 2, 'caissier'));
      }),
    );
    const { result } = renderHook(() => useActiver('Admin Dev'), {
      wrapper: wrapper(new QueryClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({ id: '4', actif: false });
      await result.current.mutateAsync({ id: '4', actif: true });
    });
    expect(corps).toEqual([{ actif: false }, { actif: true }]);
  });

  it('refuse de désactiver son propre compte ou le dernier administrateur, avec le code du serveur', async () => {
    serveurUtilisateurs();
    serveur.use(
      http.post('*/api/v1/utilisateurs/1/activation/', () =>
        HttpResponse.json({ detail: 'x', code: 'compte_propre' }, { status: 409 }),
      ),
      http.post('*/api/v1/utilisateurs/9/activation/', () =>
        HttpResponse.json({ detail: 'x', code: 'dernier_administrateur' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useActiver('Admin Dev'), {
      wrapper: wrapper(new QueryClient()),
    });
    await expect(result.current.mutateAsync({ id: '1', actif: false })).rejects.toMatchObject({
      code: 'compte_propre',
    });
    await expect(result.current.mutateAsync({ id: '9', actif: false })).rejects.toMatchObject({
      code: 'dernier_administrateur',
    });
  });
});
