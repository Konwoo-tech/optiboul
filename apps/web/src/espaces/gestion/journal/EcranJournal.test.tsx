import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { consigner } from '@/simulation/journal.ts';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranJournal from './EcranJournal.tsx';

let retablir: () => void;

async function ouvrir(
  utilisateur: string | null = 'fotso',
  langue: 'fr' | 'en' = 'fr',
  /** Gestes joués sur le faux serveur avant l'ouverture de l'écran. */
  avant?: () => void,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  avant?.();
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'journal')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/gestion/journal']}>
          <EcranJournal ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const lignes = async () =>
  within(await screen.findByRole('list')).getAllByRole('listitem') as HTMLElement[];

describe('Gestion › Journal', () => {
  it('affiche les dix lignes de la maquette : heure, auteur · profil, action', async () => {
    await ouvrir();
    const l = await lignes();
    expect(l).toHaveLength(10);
    expect(l[0]!.textContent).toBe(
      '21:41Davy · CaissierLivraison Aïcha – 7 800 FCFA dû, 7 800 reçu (Orange Money)',
    );
    expect(l[8]!.textContent).toBe('17:55Serge · Chef de productionConnexion');
    expect(l[9]!.textContent).toBe(
      '13 oct. 16:40Willy · Gérant de la semaineDépense soumise : Réparation du pétrin – 65 000 FCFA',
    );
    expect(
      screen.getByRole('heading', { name: 'Toutes les actions, avec auteur et heure' }),
    ).toBeTruthy();
  });

  it('montre en tête une action faite sur un autre écran, avec son auteur et son profil', async () => {
    await ouvrir('fotso', 'fr', () =>
      consigner({
        auteur: 'Willy',
        type: 'paie',
        texte: 'Jour de paie d’octobre fixé au 2026-10-30',
      }),
    );
    const l = await lignes();
    expect(l).toHaveLength(11);
    expect(l[0]!.textContent).toBe(
      '18:02Willy · Gérant de la semaineJour de paie d’octobre fixé au 2026-10-30',
    );
  });

  it('un auteur sans compte (le système) s’affiche sans profil', async () => {
    await ouvrir('fotso', 'fr', () =>
      consigner({ auteur: 'Système', type: 'production', texte: 'Archivage' }),
    );
    expect((await lignes())[0]!.textContent).toBe('18:02SystèmeArchivage');
  });

  it('est traduit en anglais', async () => {
    await ouvrir('fotso', 'en');
    const l = await lignes();
    expect(l[0]!.textContent).toContain('Davy · Cashier');
    expect(
      screen.getByRole('heading', { name: 'Every action, with author and time' }),
    ).toBeTruthy();
  });

  it.each([
    ['willy', 'gérant'],
    ['fotso', 'propriétaire'],
    ['admin', 'administrateur'],
  ])('est ouvert à %s (%s)', async (id) => {
    await ouvrir(id);
    expect(await lignes()).toHaveLength(10);
  });

  it.each(['davy', 'serge'])('refuse le profil de %s (message, pas de liste)', async (id) => {
    await ouvrir(id);
    expect((await screen.findByRole('alert')).textContent).toContain('réservé au gérant');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('dit que le journal est réservé quand personne n’est connecté', async () => {
    await ouvrir(null);
    expect((await screen.findByRole('alert')).textContent).toContain('réservé');
  });
});
