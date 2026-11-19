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

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranSauvegardes from './EcranSauvegardes.tsx';

vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

/*
 * Erreurs du serveur et gardes de l'écran Sauvegardes : refus (403), copie disparue (404),
 * erreur générique, double clic, actions concurrentes, piège du focus dans la fenêtre.
 */

let retablir: () => void;
const lectures = { nombre: 0 };

type Reponse = { statut: number; code: string } | 'attendre';

/** Remplace la réponse du serveur simulé pour les envois dont l'adresse se termine ainsi. */
function forcer(fin: string, reponse: Reponse) {
  const reel = globalThis.fetch;
  let liberer: () => void = () => {};
  globalThis.fetch = async (entree, init) => {
    const adresse = String(entree instanceof Request ? entree.url : entree);
    const methode = (
      init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    ).toUpperCase();
    if (methode === 'GET' && adresse.includes('/gestion/sauvegardes/')) lectures.nombre += 1;
    if (methode === 'POST' && adresse.endsWith(fin)) {
      if (reponse === 'attendre') {
        await new Promise<void>((fait) => {
          liberer = fait;
        });
        return reel(entree, init);
      }
      return Response.json(
        { detail: 'Refus simulé.', code: reponse.code },
        { status: reponse.statut },
      );
    }
    return reel(entree, init);
  };
  return () => liberer();
}

async function ouvrir() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage('fr');
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('admin');
  lectures.nombre = 0;
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
  await screen.findByText('Copie locale');
}

afterEach(() => {
  cleanup();
  retablir();
  vi.useRealTimers();
});

const ouvrirLaFenetre = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Restaurer la copie du 14 oct. 13:30' }));
  return screen.findByRole('dialog');
};
const confirmer = (fenetre: HTMLElement) =>
  fireEvent.click(within(fenetre).getByRole('button', { name: 'Restaurer cette copie' }));
const lignesDuJournal = () => lireJournal().filter((e) => e.type === 'sauvegarde');

describe('Sauvegardes : erreurs de restauration', () => {
  it('refus du droit (403) : message dans la fenêtre, fenêtre ouverte, état relu', async () => {
    await ouvrir();
    forcer('/restaurer/', { statut: 403, code: 'droit_insuffisant' });
    const fenetre = await ouvrirLaFenetre();
    const avant = lectures.nombre;
    confirmer(fenetre);
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe('Votre profil ne permet pas cette action.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(lectures.nombre).toBeGreaterThan(avant));
    expect(lesCopies()).toHaveLength(4);
    expect(lignesDuJournal()).toHaveLength(0);
  });

  it('copie disparue (404) : la fenêtre se ferme, un message le dit, la liste est relue', async () => {
    await ouvrir();
    forcer('/restaurer/', { statut: 404, code: 'copie_inconnue' });
    const fenetre = await ouvrirLaFenetre();
    const avant = lectures.nombre;
    confirmer(fenetre);
    expect(
      await screen.findByText('Cette copie n’existe plus : la liste vient d’être actualisée.'),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(lectures.nombre).toBeGreaterThan(avant));
  });

  it('erreur générique : message dans la fenêtre, et on peut réessayer', async () => {
    await ouvrir();
    forcer('/restaurer/', { statut: 500, code: 'panne' });
    const fenetre = await ouvrirLaFenetre();
    confirmer(fenetre);
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe('L’action n’a pas pu être enregistrée. Réessayez.');
    // Le bouton de confirmation est de nouveau actif et décrit par l'erreur.
    const bouton = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    expect(bouton.getAttribute('aria-disabled')).toBe('false');
    expect(bouton.getAttribute('aria-describedby')).toBe(alerte.id);
  });

  it('annoncer le contrôle simulé : mention dans la fenêtre et dans le message final', async () => {
    await ouvrir();
    const fenetre = await ouvrirLaFenetre();
    expect(within(fenetre).getByText(/le contrôle des totaux est fictif/)).toBeTruthy();
    confirmer(fenetre);
    expect(
      await screen.findByText('Restauration terminée et vérifiée (contrôle simulé)'),
    ).toBeTruthy();
  });
});

describe('Sauvegardes : copies et gardes', () => {
  it('erreur sur la copie locale : message, rien de créé, état relu', async () => {
    await ouvrir();
    forcer('/locale/', { statut: 500, code: 'panne' });
    const avant = lectures.nombre;
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder maintenant' }));
    expect(
      await screen.findByText('L’action n’a pas pu être enregistrée. Réessayez.'),
    ).toBeTruthy();
    await waitFor(() => expect(lectures.nombre).toBeGreaterThan(avant));
    expect(lesCopies()).toHaveLength(4);
    expect(lignesDuJournal()).toHaveLength(0);
  });

  it('double clic sur le bouton cloud : une seule copie, une seule ligne de journal', async () => {
    await ouvrir();
    const bouton = screen.getByRole('button', { name: 'Lancer la sauvegarde cloud' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Copie cloud envoyée et vérifiée');
    expect(lesCopies().filter((c) => c.genre === 'cloud')).toHaveLength(2);
    expect(lignesDuJournal()).toHaveLength(1);
  });

  it('pendant une action, « Restaurer » de la liste et le second bouton sont inertes', async () => {
    await ouvrir();
    const liberer = forcer('/locale/', 'attendre');
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder maintenant' }));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Lancer la sauvegarde cloud' })
          .getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer la copie du 14 oct. 13:30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la sauvegarde cloud' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    liberer();
    await screen.findByText('Copie locale faite à 18:02');
    expect(lesCopies()).toHaveLength(5);
    expect(lignesDuJournal().map((e) => e.texte)).toEqual(['Sauvegarde locale']);
  });
});

describe('Sauvegardes : fenêtre de restauration, clavier', () => {
  it('Tab reste dans la fenêtre : de la dernière à la première, Maj+Tab dans l’autre sens', async () => {
    await ouvrir();
    const fenetre = await ouvrirLaFenetre();
    const annuler = within(fenetre).getByRole('button', { name: 'Annuler' });
    const valider = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    valider.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(annuler);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(valider);
  });

  it('pendant l’envoi, Échap et Annuler ne ferment pas la fenêtre', async () => {
    await ouvrir();
    const liberer = forcer('/restaurer/', 'attendre');
    const fenetre = await ouvrirLaFenetre();
    confirmer(fenetre);
    await waitFor(() =>
      expect(
        within(fenetre).getByRole('button', { name: 'Annuler' }).getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    liberer();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lesCopies()).toHaveLength(5);
  });
});
