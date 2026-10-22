import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import { installerApiSimulee, reinitialiserSimulation } from '../../../simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '../../../simulation/session.ts';
import EcranCaisses from './Ecran.tsx';

// Les caisses ne sont lues qu'en simulation ; la simulation fait aussi office de serveur ici.
vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

const ecran = ECRANS.find((e) => e.espace === 'comptoir' && e.cle === 'caisses')!;
const NBSP = String.fromCodePoint(0xa0);

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: '' });
});

let retablir: () => void;
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('')),
  );
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
});
afterEach(() => {
  retablir();
  vi.unstubAllGlobals();
});

async function monter(utilisateur: string) {
  memoriserUtilisateurConnecte(utilisateur);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EcranCaisses ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('table');
}

const lignesDonnees = () => screen.getAllByRole('row').slice(1);
const cellules = (ligne: HTMLElement) =>
  within(ligne)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('Comptoir › Caisses', () => {
  describe('vue de la caissière', () => {
    it('affiche son titre, ses trois caisses et sa carte seulement', async () => {
      await monter('davy');
      expect(
        screen.getByRole('heading', { name: 'Ouvertures et fermetures de caisse' }),
      ).toBeTruthy();
      expect(lignesDonnees()).toHaveLength(3);
      // Pas de filtre par caissière : la caissière n'a que les siennes.
      expect(screen.queryByRole('button', { name: 'Toutes les caissières' })).toBeNull();
      expect(screen.getByText('3 ouvertures · 2 fermetures')).toBeTruthy();
      expect(screen.queryByText('Rachel')).toBeNull();
    });

    it('a un tableau de dix colonnes et une ligne en cours', async () => {
      await monter('davy');
      expect(screen.getAllByRole('columnheader')).toHaveLength(10);
      const [enCours] = lignesDonnees();
      expect(cellules(enCours!)).toEqual([
        'Nuit',
        'Davy',
        '18:02 · Davy',
        'En cours',
        `20${NBSP}000`,
        `22${NBSP}950`,
        '—',
        '—',
        'Ouverte',
      ]);
    });

    it('montre la bannière « Caisse ouverte » avec « Fermer la caisse »', async () => {
      await monter('davy');
      expect(
        screen.getByText('Caisse ouverte · session de nuit du 14 oct. · Davy depuis 18:02'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Fermer la caisse' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Ouvrir la caisse/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
    });

    it('n’affiche pas « Remettre au coffre » sous le plafond', async () => {
      await monter('davy');
      expect(screen.queryByRole('button', { name: 'Remettre au coffre' })).toBeNull();
    });
  });

  describe('vue de la direction', () => {
    it('le gérant voit toutes les caisses, le filtre et une carte par caissière', async () => {
      await monter('willy');
      expect(lignesDonnees()).toHaveLength(6);
      expect(screen.getByRole('button', { name: 'Toutes les caissières' })).toBeTruthy();
      expect(screen.getByText('3 ouvertures · 3 fermetures')).toBeTruthy();
      expect(screen.getByText(`687 050 FCFA`)).toBeTruthy();
      expect(screen.getByText(`−500 FCFA`)).toBeTruthy();
      expect(screen.getByText(`+500 FCFA`)).toBeTruthy();
    });

    it('filtre par caissière, par le bouton ou par la carte', async () => {
      await monter('willy');
      fireEvent.click(screen.getByRole('button', { name: 'Rachel' }));
      expect(lignesDonnees()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Rachel' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Toutes les caissières' }));
      expect(lignesDonnees()).toHaveLength(6);
      fireEvent.click(screen.getByRole('button', { name: /^Davys*3 ouvertures/ }));
      expect(lignesDonnees()).toHaveLength(3);
    });

    it('le propriétaire consulte et ferme, sans bouton pour ouvrir', async () => {
      await monter('fotso');
      expect(lignesDonnees()).toHaveLength(6);
      expect(screen.getByRole('button', { name: 'Fermer la caisse' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Ouvrir la caisse/ })).toBeNull();
    });

    it('l’autre caissière voit la bannière sans pouvoir fermer la caisse de Davy', async () => {
      await monter('rachel');
      expect(screen.getByText(/^Caisse ouverte · session de nuit/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Fermer la caisse' })).toBeNull();
      expect(lignesDonnees()).toHaveLength(3);
    });
  });

  describe('fermeture avec un seul comptage', () => {
    it('calcule l’écart tout de suite puis ferme la caisse', async () => {
      await monter('davy');
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog', { name: 'Fermeture de caisse' });
      const confirmer = within(fenetre).getByRole('button', { name: 'Fermer la caisse' });
      expect(confirmer).toHaveProperty('disabled', true);
      expect(within(fenetre).getByText(`22 950 FCFA`)).toBeTruthy();
      expect(within(fenetre).getByText('Saisissez les espèces comptées')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22450' },
      });
      expect(within(fenetre).getByText('Manque 500 FCFA')).toBeTruthy();
      expect(within(fenetre).getByText('−500 FCFA')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '23000' },
      });
      expect(within(fenetre).getByText('Excédent de 50 FCFA')).toBeTruthy();
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      expect(within(fenetre).getByText('Caisse juste')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22450' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));

      expect(await screen.findByText('Caisse fermée et verrouillée')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      const bouton = await screen.findByRole('button', { name: 'Ouvrir la caisse · jour 15 oct.' });
      expect(bouton).toBeTruthy();
      const [premiere] = lignesDonnees();
      expect(cellules(premiere!).at(-1)).toBe('Manque');
      expect(cellules(premiere!).at(-2)).toBe(`−500`);
    });
  });

  describe('ouverture avec comptage du fonds', () => {
    async function fermerPuisOuvrirLaModale(utilisateur: string) {
      await monter(utilisateur);
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog');
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));
      const ouvrir = await screen.findByRole('button', { name: 'Ouvrir la caisse · jour 15 oct.' });
      ouvrir.focus();
      fireEvent.click(ouvrir);
      return {
        ouvrir,
        fenetre: await screen.findByRole('dialog', { name: 'Ouverture de caisse' }),
      };
    }

    it('propose 20 000 FCFA et signale une ouverture hors planning', async () => {
      const { fenetre } = await fermerPuisOuvrirLaModale('davy');
      expect(within(fenetre).getByLabelText('Fonds de caisse compté (FCFA)')).toHaveProperty(
        'value',
        '20000',
      );
      expect(within(fenetre).getByText('Caissière planifiée : Rachel')).toBeTruthy();
      expect(within(fenetre).getByText(/Vous n’êtes pas la personne planifiée/)).toBeTruthy();
      expect(within(fenetre).getByText(/^Ouverture par Davy · \d\d:\d\d$/)).toBeTruthy();
    });

    it('n’alerte pas la caissière planifiée', async () => {
      // Le gérant ferme, puis Rachel (planifiée) ouvre.
      await fermerPuisOuvrirLaModale('willy');
      expect(screen.getByText(/Vous n’êtes pas la personne planifiée/)).toBeTruthy();
    });

    it('rend le focus au bouton à la fermeture et ouvre la caisse avec le fonds compté', async () => {
      const { ouvrir, fenetre } = await fermerPuisOuvrirLaModale('davy');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(ouvrir);

      fireEvent.click(ouvrir);
      const reouverte = await screen.findByRole('dialog', { name: 'Ouverture de caisse' });
      expect(reouverte).not.toBe(fenetre);
      fireEvent.change(within(reouverte).getByLabelText('Fonds de caisse compté (FCFA)'), {
        target: { value: '25 000 FCFA' },
      });
      fireEvent.click(within(reouverte).getByRole('button', { name: 'Ouvrir la caisse' }));

      expect(await screen.findByText(`Caisse ouverte · fonds 25 000 FCFA`)).toBeTruthy();
      expect(
        await screen.findByText(/^Caisse ouverte · session de jour du 15 oct\. · Davy depuis/),
      ).toBeTruthy();
      expect(cellules(lignesDonnees()[0]!)[0]).toBe('Jour');
    });
  });

  describe('remise au coffre', () => {
    it('est proposée au-delà de 100 000 FCFA, avec la remise de tout sauf le fonds', async () => {
      memoriserUtilisateurConnecte('davy');
      await fetch('/api/v1/simulation/caisses/encaissements/', {
        method: 'POST',
        body: JSON.stringify({ especes: 80_000 }),
      });
      await monter('davy');
      expect(screen.getByText(`Plus de 100 000 FCFA en caisse`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remettre au coffre' }));
      const fenetre = await screen.findByRole('dialog', { name: 'Remise au coffre' });
      expect(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)')).toHaveProperty(
        'value',
        '82950',
      );
      expect(within(fenetre).getByText(`Reste attendu en caisse : 20 000 FCFA`)).toBeTruthy();

      // Au-delà des espèces en caisse : refusé.
      fireEvent.change(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)'), {
        target: { value: '200000' },
      });
      expect(within(fenetre).getByRole('alert').textContent).toMatch(/ne pas dépasser/);
      expect(within(fenetre).getByRole('button', { name: 'Enregistrer la remise' })).toHaveProperty(
        'disabled',
        true,
      );

      fireEvent.change(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)'), {
        target: { value: '82950' },
      });
      fireEvent.change(within(fenetre).getByLabelText('Remis à'), { target: { value: 'fotso' } });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Enregistrer la remise' }));

      expect(
        await screen.findByText(`Remise de 82 950 FCFA au coffre · reçue par M. Fotso`),
      ).toBeTruthy();
      // Sous le plafond, la proposition disparaît ; l'attendu a baissé du montant remis.
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remettre au coffre' })).toBeNull(),
      );
    });
  });

  describe('réouverture avec motif', () => {
    async function fermerEnTantQueGerant() {
      await monter('willy');
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog');
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));
      return screen.findByRole('button', { name: 'Rouvrir la caisse' });
    }

    it('est proposée au gérant seulement, une fois la caisse fermée', async () => {
      await monter('willy');
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
      expect(await fermerEnTantQueGerant()).toBeTruthy();
    });

    it('exige un motif puis rouvre la caisse', async () => {
      fireEvent.click(await fermerEnTantQueGerant());
      const fenetre = await screen.findByRole('dialog', { name: 'Rouvrir la caisse' });
      expect(within(fenetre).getByText('Caisse de la session de nuit du 14 oct.')).toBeTruthy();

      fireEvent.click(within(fenetre).getByRole('button', { name: 'Rouvrir la caisse' }));
      expect(within(fenetre).getByRole('alert').textContent).toBe(
        'Motif obligatoire : précisez la raison de la réouverture.',
      );

      fireEvent.change(within(fenetre).getByLabelText('Motif de la réouverture'), {
        target: { value: 'Erreur de comptage' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Rouvrir la caisse' }));

      expect(await screen.findByText('Caisse rouverte · tracé dans le journal')).toBeTruthy();
      expect(await screen.findByRole('button', { name: 'Fermer la caisse' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
    });
  });

  it('affiche les textes en anglais', async () => {
    const { changerLangue } = await import('@/i18n');
    await changerLangue('en');
    try {
      await monter('willy');
      expect(screen.getByRole('button', { name: 'All cashiers' })).toBeTruthy();
      expect(
        screen.getByText('Cash desk open · night session Oct 14 · Davy since 18:02'),
      ).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: 'Cashier' })).toBeTruthy();
      expect(screen.getAllByText('Mon Oct 12').length).toBeGreaterThan(0);
    } finally {
      await changerLangue('fr');
    }
  });
});
