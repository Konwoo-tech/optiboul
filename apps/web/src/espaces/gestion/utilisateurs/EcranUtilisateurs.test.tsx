import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { journalUtilisateurs } from '@/simulation/utilisateurs.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranUtilisateurs from './EcranUtilisateurs.tsx';

vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(utilisateur = 'admin', langue: 'fr' | 'en' = 'fr', chemin = '') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'utilisateurs')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/utilisateurs${chemin}`]}>
          <EcranUtilisateurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  cleanup();
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const onglet = (nom: RegExp) => screen.getByRole('tab', { name: nom });

describe('Gestion › Utilisateurs : liste', () => {
  it('affiche les onglets, les filtres, les neuf comptes et les droits par profil', async () => {
    await ouvrir();
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 9' })).toBeTruthy();
    expect(onglet(/Groupes · 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tous · 9' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(9);
    expect(
      screen.getByText(
        /davy\.boulfaubourg@gmail\.com · \+237 6 77 41 20 18 · dernier accès 14 oct\. 18:02/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Droits par profil' })).toBeTruthy();
  });

  it('filtre par groupe et dit quand un groupe est vide', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Production · 2' }));
    const liste = screen.getByRole('list', { name: 'Utilisateurs' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
  });

  it('verrouille le groupe et la désactivation de son propre compte', async () => {
    await ouvrir();
    const groupe = (await screen.findByLabelText(
      'Groupe de Support OptiBoul',
    )) as HTMLSelectElement;
    expect(groupe.disabled).toBe(true);
    expect(
      screen.queryByRole('button', { name: /Désactiver le compte de Support OptiBoul/ }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: /Désactiver le compte de Davy/ })).toBeTruthy();
  });

  it('change un utilisateur de groupe : toast, profil mis à jour, journal', async () => {
    await ouvrir();
    fireEvent.change(await screen.findByLabelText('Groupe de Davy'), { target: { value: 'g3' } });
    expect(
      await screen.findByText('Davy → Gérants de la semaine · droits « Gérant de la semaine »'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/^Davy ·/).textContent).toContain('Gérant de la semaine'),
    );
    expect(journalUtilisateurs()[0]?.quoi).toContain('Davy → Gérants de la semaine');
  });

  it('réinitialise le code et désactive puis réactive un compte', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Code de Rachel réinitialisé')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Rachel' }));
    expect(await screen.findByText('Désactivé')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Réactiver le compte de Rachel' }));
    await waitFor(() => expect(screen.getAllByText('Actif')).toHaveLength(9));
  });

  it('dit le refus du serveur quand le profil ne permet pas l’action', async () => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    memoriserUtilisateurConnecte('willy');
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Votre profil ne permet pas cette action.')).toBeTruthy();
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('admin', 'en');
    expect(await screen.findByRole('tab', { name: 'Users · 9' })).toBeTruthy();
    expect(screen.getByText(/last access Oct 14 18:02/, { exact: false })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Rights by profile' })).toBeTruthy();
  });
});

describe('Gestion › Utilisateurs : accès', () => {
  it('navigue entre onglets au clavier', async () => {
    await ouvrir();
    const premier = await screen.findByRole('tab', { name: 'Utilisateurs · 9' });
    fireEvent.keyDown(premier, { key: 'ArrowRight' });
    await waitFor(() => expect(onglet(/Groupes/).getAttribute('aria-selected')).toBe('true'));
    expect(premier.getAttribute('tabindex')).toBe('-1');
  });

  it('un profil sans le droit voit une erreur, pas la liste', async () => {
    await ouvrir('willy');
    expect(await screen.findByText('Impossible de lire les utilisateurs. Réessayez.')).toBeTruthy();
  });
});
