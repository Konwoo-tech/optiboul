import { configurerApi } from '@/api';
import { changerLangue, initI18n } from '@/i18n';
import { installerApiSimulee, reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ecran } from '../../navigation.ts';
import EcranClients from './EcranClients.tsx';

// L'écran lit le faux serveur en mode simulation : ces tests parcourent ce mode (le vrai serveur est
// couvert par api.test.tsx).
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

const ECRAN: Ecran = { cle: 'clients', espace: 'comptoir', profils: ['caissier'] };
const espace = (texte: string) => texte.replace(/ /g, ' ');

let retablir: () => void;

beforeAll(() => {
  initI18n('fr');
  configurerApi({ baseUrl: 'http://localhost' });
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('')),
  );
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
});
afterEach(async () => {
  retablir();
  vi.unstubAllGlobals();
  await changerLangue('fr');
});

/** Montre l'adresse courante, pour vérifier ce que l'écran y écrit. */
function Adresse() {
  return <output data-testid="adresse">{useLocation().search}</output>;
}

function ouvrir(utilisateur: string | null, adresse = '/') {
  memoriserUtilisateurConnecte(utilisateur);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[adresse]}>
          <EcranClients ecran={ECRAN} />
          <Adresse />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

const lignes = async () =>
  within(await screen.findByRole('list', { name: 'Liste des clients' })).getAllByRole('listitem');

describe('Clients et dettes', () => {
  it('affiche les trois chiffres clés et les filtres avec leur nombre', async () => {
    ouvrir('davy');
    expect(await screen.findByText('Dettes clients')).toBeTruthy();
    expect(espace(screen.getByText('Dettes clients').nextElementSibling?.textContent ?? '')).toBe(
      '−14 050 FCFA',
    );
    expect(screen.getByText('Clients en dette').nextElementSibling?.textContent).toBe('8');
    expect(espace(screen.getByText(/^Au-delà du plafond de/).textContent ?? '')).toBe(
      'Au-delà du plafond de 2 000',
    );
    // Espace insécable U+00A0 des milliers, comme le design (pas U+202F).
    expect(screen.getByText('Dettes clients').nextElementSibling?.textContent).toBe(
      '−14\u00A0050 FCFA',
    );
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'À régler avant dimanche · 8' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plafond dépassé · 3' })).toBeTruthy();
  });

  it('classe du plus endetté au moins endetté, avec le statut de chacun', async () => {
    ouvrir('davy');
    const toutes = await lignes();
    expect(toutes).toHaveLength(12);
    expect(within(toutes[0]!).getByText('Brice')).toBeTruthy();
    expect(within(toutes[0]!).getByText('Plafond dépassé')).toBeTruthy();
    expect(espace(within(toutes[0]!).getByText(/^4.200 \/ 2.000 FCFA$/).textContent ?? '')).toBe(
      '4 200 / 2 000 FCFA',
    );
    expect(within(toutes[3]!).getByText('Dette')).toBeTruthy();
    expect(within(toutes[11]!).getByText('À jour')).toBeTruthy();
    expect(within(toutes[11]!).getByText('Aucune dette')).toBeTruthy();
  });

  it('filtre la liste et marque le filtre actif', async () => {
    ouvrir('davy');
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Plafond dépassé · 3' }));
    expect(await lignes()).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: 'Plafond dépassé · 3' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'À régler avant dimanche · 8' }));
    expect(await lignes()).toHaveLength(8);
  });

  it('la caissière ne relance pas', async () => {
    ouvrir('davy');
    await lignes();
    expect(screen.queryByRole('button', { name: /^Relancer/ })).toBeNull();
  });

  it('le gérant relance un client ou tous les clients en dette, avec un message', async () => {
    ouvrir('willy');
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer Brice' }));
    expect(
      (await screen.findByText(/^Relance WhatsApp envoyée à Brice/)).textContent?.replace(
        / /g,
        ' ',
      ),
    ).toBe('Relance WhatsApp envoyée à Brice : 4 200 FCFA à régler avant dimanche.');
    expect(await screen.findByRole('button', { name: 'Relancé : Brice' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Relancer les 8 clients en dette' }));
    expect(await screen.findByText('8 relances WhatsApp envoyées')).toBeTruthy();
  });

  it('ouvre le détail d’un client au clic et y place le focus', async () => {
    ouvrir('davy');
    const [brice] = await lignes();
    expect(screen.getByText(/^Sélectionnez un client/)).toBeTruthy();
    fireEvent.click(brice!);
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    expect(document.activeElement).toBe(titre);
    expect(screen.getByText('À régler avant dimanche 18 octobre')).toBeTruthy();
    expect(screen.getByText('Tarifs : BAG 100 · KO 75 · GC 135 165 FCFA')).toBeTruthy();
    expect(await screen.findByText('Livraison bon n° 128')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relevé PDF' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le relevé par WhatsApp' }));
    expect(await screen.findByText('Relevé envoyé par WhatsApp à Brice')).toBeTruthy();
  });

  it('rouvre le client et le filtre demandés dans l’adresse', async () => {
    ouvrir('willy', '/?filtre=depasse&client=ebene');
    expect(await lignes()).toHaveLength(3);
    expect(await screen.findByRole('heading', { name: 'Ebène', level: 2 })).toBeTruthy();
  });

  it('un clic écrit le client et le filtre dans l’adresse, un second clic referme le détail', async () => {
    ouvrir('davy');
    const [brice] = await lignes();
    fireEvent.click(brice!);
    expect(screen.getByTestId('adresse').textContent).toBe('?client=brice');
    fireEvent.click(screen.getByRole('button', { name: 'Plafond dépassé · 3' }));
    expect(screen.getByTestId('adresse').textContent).toBe('?client=brice&filtre=depasse');
    fireEvent.click((await lignes())[0]!);
    expect(screen.getByTestId('adresse').textContent).toBe('?filtre=depasse');
    expect(screen.queryByRole('heading', { name: 'Brice', level: 2 })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tous · 12' }));
    expect(screen.getByTestId('adresse').textContent).toBe('');
  });

  it('Échap referme le détail et rend le focus à la ligne', async () => {
    ouvrir('davy');
    fireEvent.click((await lignes())[0]!);
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    fireEvent.keyDown(titre, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Brice', level: 2 })).toBeNull();
    expect(document.activeElement?.textContent).toBe('Brice');
  });

  it('n’enlève pas le focus à l’arrivée avec ?client= dans l’adresse', async () => {
    ouvrir('davy', '/?client=brice');
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    expect(document.activeElement).not.toBe(titre);
  });

  it('ignore un filtre inconnu dans l’adresse', async () => {
    ouvrir('davy', '/?filtre=nimporte');
    expect(await lignes()).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('le propriétaire relance comme le gérant', async () => {
    ouvrir('fotso');
    await lignes();
    expect(screen.getByRole('button', { name: 'Relancer les 8 clients en dette' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relancer Brice' })).toBeTruthy();
  });

  it('signale une erreur de chargement', async () => {
    ouvrir(null);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Impossible de charger les clients.',
    );
  });

  it('une relance qui échoue ne dit pas « envoyée »', async () => {
    ouvrir('willy');
    await lignes();
    const simule = globalThis.fetch;
    globalThis.fetch = async (entree, init) =>
      String(entree instanceof Request ? entree.url : entree).includes('/relancer/')
        ? new Response('{}', { status: 500 })
        : simule(entree, init);
    fireEvent.click(screen.getByRole('button', { name: 'Relancer Brice' }));
    expect(await screen.findByText('La relance a échoué : réessayez.')).toBeTruthy();
    expect(screen.queryByText(/^Relance WhatsApp envoyée/)).toBeNull();
  });

  it('parle anglais', async () => {
    await changerLangue('en');
    ouvrir('willy');
    expect(await screen.findByText('Customer debts')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remind all 8 customers in debt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Due before Sunday · 8' })).toBeTruthy();
  });
});
