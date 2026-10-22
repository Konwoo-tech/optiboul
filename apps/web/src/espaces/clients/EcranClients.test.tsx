import { configurerApi } from '@/api';
import { changerLangue, initI18n } from '@/i18n';
import { installerApiSimulee, reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ecran } from '../../navigation.ts';
import EcranClients from './EcranClients.tsx';

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

function ouvrir(utilisateur: string, adresse = '/') {
  memoriserUtilisateurConnecte(utilisateur);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[adresse]}>
          <EcranClients ecran={ECRAN} />
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
    expect(await screen.findByRole('button', { name: 'Relancé Brice' })).toBeTruthy();

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

  it('parle anglais', async () => {
    await changerLangue('en');
    ouvrir('willy');
    expect(await screen.findByText('Customer debts')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remind all 8 customers in debt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Due before Sunday · 8' })).toBeTruthy();
  });
});
