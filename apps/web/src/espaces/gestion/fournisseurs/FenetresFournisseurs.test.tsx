import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation, repondre } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranFournisseurs from './EcranFournisseurs.tsx';

let retablir: () => void;

async function ouvrir(adresse = '') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage('fr');
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'fournisseurs')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/fournisseurs${adresse}`]}>
          <EcranFournisseurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('tablist');
  await screen.findByText(/Dette fournisseurs/);
}

afterEach(() => {
  retablir();
  vi.useRealTimers();
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });

describe('Gestion › Fournisseurs : fenêtres et liste périmée', () => {
  it('une quantité énorme garde la fenêtre ouverte, la saisie et l’erreur sur le champ', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    const champ = within(fenetre).getByLabelText('Quantité réellement livrée') as HTMLInputElement;
    saisir(champ, '99999');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toMatch(/^Quantité trop élevée \(maximum 10\s000\)\.$/);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(champ.value).toBe('99999');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(document.activeElement).toBe(champ);
    saisir(champ, '8');
    expect(within(fenetre).queryByRole('alert')).toBeNull();
  });

  it('la planification refuse une quantité énorme sans envoyer', async () => {
    await ouvrir();
    saisir(screen.getByLabelText('Quantité commandée'), '20000');
    fireEvent.click(bouton('Planifier'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Quantité trop élevée \(maximum 10\s000\)\.$/,
    );
    expect(screen.queryByText(/Réception planifiée/)).toBeNull();
  });

  it('le focus revient sur le bouton d’origine quand la fenêtre de paiement se ferme', async () => {
    await ouvrir('?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    const declencheur = bouton('Payer FAC-41');
    declencheur.focus();
    fireEvent.click(declencheur);
    const fenetre = await screen.findByRole('dialog');
    expect(fenetre.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(declencheur);
  });

  it('si la facture a été payée entre-temps, la fenêtre se ferme, la liste est relue et l’erreur annoncée', async () => {
    await ouvrir('?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    const valider = await screen.findByRole('button', { name: 'Enregistrer le paiement' });
    await act(async () => {
      const r = repondre(
        new URL('http://x/api/v1/simulation/gestion/fournisseurs/paiements/'),
        'POST',
        { facture: 'FAC-41', mode: 'banque' },
      );
      await r.json();
    });
    fireEvent.click(valider);
    expect(
      await screen.findByText('Cette ligne a déjà été traitée. La liste est à jour.'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(within(screen.getByText(/^FAC-41 · /).closest('li')!).getByText('Payée')).toBeTruthy(),
    );
  });

  it('le panneau d’un onglet est atteignable au clavier', async () => {
    await ouvrir();
    expect(screen.getByRole('tabpanel').getAttribute('tabindex')).toBe('0');
  });
});
