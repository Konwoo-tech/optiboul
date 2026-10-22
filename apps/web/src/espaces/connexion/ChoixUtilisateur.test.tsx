import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { identifier, installerApiSimulee, type Identification } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { lireUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChoixUtilisateur } from './ChoixUtilisateur.tsx';

let retablir: () => void;

// Sans double authentification : le bon code ouvre directement la session.
const identifierSansDeuxFacteurs = async (identification: Identification) => {
  await identifier(identification, false);
};

beforeEach(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ChoixUtilisateur identifier={identifierSansDeuxFacteurs} />
      </QueryClientProvider>
    </OptiboulProvider>,
  );
});
afterEach(() => retablir());

async function saisir(code: string) {
  for (const chiffre of code) fireEvent.click(await screen.findByRole('button', { name: chiffre }));
}

describe('connexion par nom et code (simulation)', () => {
  it('propose les neuf comptes de démonstration avec le profil de chacun', async () => {
    expect(await screen.findByRole('heading', { name: 'Qui êtes-vous ?' })).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /Caissier|Gérant|Chef|Propriétaire|Admin/ }),
    ).toHaveLength(9);
    expect(screen.getByRole('button', { name: /M\. Fotso/ })).toBeTruthy();
  });

  it('connecte avec le bon code', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Davy/ }));
    await saisir('1234');
    await waitFor(() => expect(lireUtilisateurConnecte()?.id).toBe('davy'));
  });

  it('refuse un mauvais code et le dit', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Rachel/ }));
    await saisir('0000');
    expect(
      await screen.findByText(
        'Code incorrect. Réessayez ou demandez à l’administrateur de le réinitialiser.',
      ),
    ).toBeTruthy();
    expect(lireUtilisateurConnecte()).toBeUndefined();
  });

  it('permet de changer de personne', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Willy/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Changer de personne/ }));
    expect(await screen.findByRole('heading', { name: 'Qui êtes-vous ?' })).toBeTruthy();
  });

  it('revient au choix de la personne avec la touche Échap', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Serge/ }));
    await screen.findByRole('button', { name: 'Valider' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await screen.findByRole('heading', { name: 'Qui êtes-vous ?' })).toBeTruthy();
  });

  it('quitter l’écran pendant le délai annule la vérification (personne n’est connecté)', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Davy/ }));
    await saisir('1234');
    fireEvent.keyDown(window, { key: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(lireUtilisateurConnecte()).toBeUndefined();
  });

  it('« Valider » juste après le 4ᵉ chiffre ne lance qu’une identification', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Davy/ }));
    await saisir('1234');
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(lireUtilisateurConnecte()?.id).toBe('davy'));
  });
});
