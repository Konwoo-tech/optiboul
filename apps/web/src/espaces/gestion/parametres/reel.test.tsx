import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useModifierParametre } from './api.ts';
import { lireHistoriqueReel, lireParametresReels, lireProduitsReels, versProduit } from './reel.ts';
import { ReglesNotification } from './ReglesNotification.tsx';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api).
const PARAMETRE = {
  cle: 'seuil_validation_depenses',
  libelle: 'Seuil de validation des dépenses',
  genre: 'montant',
  unite: 'FCFA',
  usage: 'R8',
  valeur: 25000,
  defaut: 50000,
  choix: [],
  minimum: null,
  maximum: null,
  modifie_le: '2026-11-19T14:26:30Z',
  modifie_par: 'Patron Dev',
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

describe('lecture des paramètres sur le vrai serveur', () => {
  it('lit le catalogue (liste simple) et l’historique d’une clé', async () => {
    serveur.use(
      http.get('*/api/v1/parametres/', () => HttpResponse.json([PARAMETRE])),
      http.get('*/api/v1/parametres/seuil_validation_depenses/historique/', () =>
        HttpResponse.json([
          { valeur: 25000, auteur: 'Patron Dev', le: '2026-11-19T15:26:30+01:00' },
        ]),
      ),
    );
    expect(await lireParametresReels()).toEqual([PARAMETRE]);
    expect(await lireHistoriqueReel('seuil_validation_depenses')).toEqual([
      { valeur: 25000, auteur: 'Patron Dev', le: '2026-11-19T15:26:30+01:00' },
    ]);
  });

  it('les produits : fiche résumée, code lisible, prix unique, sans fiche écartés', async () => {
    serveur.use(
      http.get('*/api/v1/produits/', () =>
        HttpResponse.json(
          page([
            {
              id: 1,
              code: 'GC135',
              nom: 'Gros court 135',
              nom_en: '',
              prix: 100,
              fiche: { poids_boule: 4800, pains_par_boule: 19, pains_par_sac: 315 },
            },
            { id: 2, code: 'KO', nom: 'Kirikou', nom_en: 'Kirikou', prix: 0, fiche: null },
          ]),
        ),
      ),
    );
    expect(await lireProduitsReels()).toEqual([
      {
        id: 'gc135',
        code: 'GC 135',
        nom: 'Gros court 135',
        nomEn: 'Gros court 135',
        boule: 4800,
        pb: 19,
        painsParSac: 315,
        prix: [100, 100],
      },
    ]);
    expect(
      versProduit({
        code: 'X',
        nom: 'x',
        prix: 0,
        fiche: { poids_boule: 1, pains_par_boule: 1, pains_par_sac: 1 },
      } as never),
    ).toMatchObject({ prix: null });
  });

  it('enregistre une valeur : la réponse du serveur remplace la ligne', async () => {
    let corps: unknown;
    serveur.use(
      http.put('*/api/v1/parametres/seuil_validation_depenses/', async ({ request }) => {
        corps = await request.json();
        return HttpResponse.json({ ...PARAMETRE, valeur: 30000 });
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: new QueryClient() }, children);
    const { result } = renderHook(() => useModifierParametre('Patron'), { wrapper });
    let reponse: unknown;
    await act(async () => {
      reponse = await result.current.mutateAsync({
        cle: 'seuil_validation_depenses',
        valeur: 30000,
      });
    });
    expect(corps).toEqual({ valeur: 30000 });
    expect(reponse).toMatchObject({ valeur: 30000 });
  });
});

describe('règles de notification', () => {
  it('liste les règles, coche un profil et un canal, lecture seule sans droit', async () => {
    await initI18n('fr').changeLanguage('fr');
    const recus: unknown[] = [];
    const REGLE = {
      genre: 'plan.propose',
      libelle: 'Plan proposé',
      profils: ['gerant'],
      canaux: ['application'],
    };
    serveur.use(
      http.get('*/api/v1/regles-notification/', () => HttpResponse.json([REGLE])),
      http.put('*/api/v1/regles-notification/plan.propose/', async ({ request }) => {
        const corps = (await request.json()) as { profils: string[]; canaux: string[] };
        recus.push(corps);
        return HttpResponse.json({ ...REGLE, ...corps });
      }),
    );
    const rendu = (lecture: boolean) => (
      <OptiboulProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ReglesNotification lecture={lecture} />
        </QueryClientProvider>
      </OptiboulProvider>
    );
    const { unmount } = render(rendu(false));
    expect(await screen.findByText('Plan proposé')).toBeTruthy();
    const profils = screen.getByRole('group', { name: 'Profils prévenus · Plan proposé' });
    fireEvent.click(profils.querySelectorAll('input')[0]!);
    await waitFor(() => expect(recus).toHaveLength(1));
    expect(recus[0]).toEqual({ profils: ['gerant', 'proprietaire'], canaux: ['application'] });
    const canaux = screen.getByRole('group', { name: 'Canaux · Plan proposé' });
    fireEvent.click(canaux.querySelectorAll('input')[1]!);
    await waitFor(() => expect(recus).toHaveLength(2));
    expect((recus[1] as { canaux: string[] }).canaux).toContain('whatsapp');
    unmount();
    render(rendu(true));
    await screen.findByText('Plan proposé');
    for (const c of screen.getAllByRole('checkbox'))
      expect((c as HTMLInputElement).disabled).toBe(true);
  });
});
