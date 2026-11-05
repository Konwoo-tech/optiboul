import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { lireJournal } from '@/simulation/journal.ts';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { lesCopies } from '@/simulation/sauvegardes.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranSauvegardes from './EcranSauvegardes.tsx';

vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(utilisateur = 'admin', langue: 'fr' | 'en' = 'fr') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'sauvegardes')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/gestion/sauvegardes']}>
          <EcranSauvegardes ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  cleanup();
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const lignesDuJournal = () => lireJournal().filter((e) => e.type === 'sauvegarde');

describe('Gestion › Sauvegardes : état', () => {
  it('affiche les cartes, le bandeau des 48 h et les quatre copies', async () => {
    await ouvrir();
    expect(await screen.findByText('Copie locale')).toBeTruthy();
    expect(screen.getByText('14 oct. 21:30', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('Copie cloud')).toBeTruthy();
    expect(screen.getByText('En retard')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'Aucune copie cloud depuis plus de 48 h (dernière : 12 oct. 17:52).',
    );
    expect(screen.getByText('Connexion disponible')).toBeTruthy();
    const liste = screen.getByRole('list');
    expect(within(liste).getAllByRole('listitem')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: 'Restaurer la copie du 13 oct. 21:30' }),
    ).toBeTruthy();
  });

  it('existe en anglais', async () => {
    await ouvrir('admin', 'en');
    expect(await screen.findByText('Local copy')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start cloud backup' })).toBeTruthy();
  });

  it('affiche une erreur quand le serveur refuse (profil sans droit)', async () => {
    await ouvrir('willy');
    expect(await screen.findByText('Impossible de lire les sauvegardes. Réessayez.')).toBeTruthy();
  });
});

describe('Gestion › Sauvegardes : sauvegarder', () => {
  it('lance une copie locale : toast, nouvelle copie en tête, une ligne de journal', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Sauvegarder maintenant' }));
    expect(await screen.findByText('Copie locale faite à 18:02')).toBeTruthy();
    await waitFor(() => expect(lesCopies()).toHaveLength(5));
    expect(lignesDuJournal().map((e) => e.texte)).toEqual(['Sauvegarde locale']);
    expect(screen.getByText('14 oct. 18:02', { selector: 'div' })).toBeTruthy();
  });

  it('une seule copie malgré deux clics rapides', async () => {
    await ouvrir();
    const bouton = await screen.findByRole('button', { name: 'Sauvegarder maintenant' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Copie locale faite à 18:02');
    expect(lesCopies()).toHaveLength(5);
    expect(lignesDuJournal()).toHaveLength(1);
  });

  it('lance une copie cloud : le bandeau disparaît et la pastille passe à « À jour »', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la sauvegarde cloud' }));
    expect(await screen.findByText('Copie cloud envoyée et vérifiée')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('À jour')).toBeTruthy();
    expect(lignesDuJournal().map((e) => e.texte)).toEqual(['Sauvegarde cloud']);
  });

  it('hors ligne : la copie cloud ne part pas, un message le dit', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    await ouvrir();
    expect(
      await screen.findByText('Hors ligne : la copie partira au retour d’internet'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la sauvegarde cloud' }));
    expect(await screen.findByText('Hors ligne : sauvegarde cloud en attente')).toBeTruthy();
    expect(lesCopies()).toHaveLength(4);
    expect(lignesDuJournal()).toHaveLength(0);
    // La copie locale reste possible.
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder maintenant' }));
    await screen.findByText('Copie locale faite à 18:02');
  });
});

describe('Gestion › Sauvegardes : restauration guidée', () => {
  const ouvrirLaFenetre = async () => {
    await ouvrir();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restaurer la copie du 14 oct. 13:30' }),
    );
    return screen.findByRole('dialog');
  };

  it('annonce les trois étapes avec la date de la copie, sans rien restaurer encore', async () => {
    const fenetre = await ouvrirLaFenetre();
    expect(within(fenetre).getByText('Restauration guidée')).toBeTruthy();
    expect(
      within(fenetre).getByText('Une copie de l’état actuel est faite automatiquement.'),
    ).toBeTruthy();
    expect(within(fenetre).getByText('La copie du 14 oct. 13:30 est restaurée.')).toBeTruthy();
    expect(
      within(fenetre).getByText('Les totaux sont vérifiés : sessions, soldes clients, stocks.'),
    ).toBeTruthy();
    expect(lesCopies()).toHaveLength(4);
  });

  it('annuler ferme la fenêtre sans rien changer', async () => {
    const fenetre = await ouvrirLaFenetre();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lesCopies()).toHaveLength(4);
    expect(lignesDuJournal()).toHaveLength(0);
  });

  it('confirmer fait la copie de sûreté, consigne une ligne, ferme et prévient', async () => {
    const fenetre = await ouvrirLaFenetre();
    const confirmer = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    fireEvent.click(confirmer);
    fireEvent.click(confirmer);
    expect(await screen.findByText('Restauration terminée et vérifiée')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lesCopies()).toHaveLength(5);
    expect(lignesDuJournal().map((e) => e.texte)).toEqual([
      'Restauration de la copie du 14 oct. 13:30',
    ]);
  });

  it('Échap ferme la fenêtre', async () => {
    await ouvrirLaFenetre();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('le focus entre dans la fenêtre et revient au bouton qui l’a ouverte', async () => {
    await ouvrir();
    const declencheur = await screen.findByRole('button', {
      name: 'Restaurer la copie du 14 oct. 13:30',
    });
    declencheur.focus();
    fireEvent.click(declencheur);
    const fenetre = await screen.findByRole('dialog');
    expect(fenetre.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(declencheur));
  });
});
