import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import {
  installerApiSimulee,
  MOT_DE_PASSE_DEMO,
  texteDemo,
  useUtilisateursSimules,
  type Identification,
} from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormulaireEmail } from './FormulaireEmail.tsx';

let retablir: () => void;
const identifier = vi.fn<(identification: Identification) => Promise<void>>();
const surGoogle = vi.fn();

// Les comptes de démonstration viennent du faux serveur, comme dans l'application en simulation.
function Hote() {
  const { data } = useUtilisateursSimules();
  return (
    <FormulaireEmail
      identifier={identifier}
      onGoogle={surGoogle}
      demo={{
        comptes: data ?? [],
        motDePasse: MOT_DE_PASSE_DEMO,
        texte: texteDemo('demoIdentifiants', 'fr'),
      }}
    />
  );
}

beforeEach(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  identifier.mockReset().mockResolvedValue();
  surGoogle.mockReset();
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Hote />
      </QueryClientProvider>
    </OptiboulProvider>,
  );
});
afterEach(() => retablir());

const champEmail = () => screen.getByLabelText('Adresse e-mail') as HTMLInputElement;
const champMotDePasse = () => screen.getByLabelText('Mot de passe') as HTMLInputElement;

describe('connexion par Google ou e-mail', () => {
  it('propose Google, le formulaire et les profils de démonstration', async () => {
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuer avec Google' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Rachel/ })).toBeTruthy();
    expect(screen.getByText('Profils de démonstration')).toBeTruthy();
  });

  it('ouvre le choix du compte Google', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }));
    expect(surGoogle).toHaveBeenCalledTimes(1);
  });

  it('remplit le formulaire en touchant un profil de démonstration', async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Willy/ }));
    expect(champEmail().value).toBe('willy.boulfaubourg@gmail.com');
    expect(champMotDePasse().value).toBe('optiboul');
  });

  it('demande les deux champs avant d’appeler le serveur', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('Saisissez votre e-mail et votre mot de passe.')).toBeTruthy();
    expect(identifier).not.toHaveBeenCalled();
  });

  it('envoie l’e-mail et le mot de passe saisis', async () => {
    fireEvent.change(champEmail(), { target: { value: 'davy.boulfaubourg@gmail.com' } });
    fireEvent.change(champMotDePasse(), { target: { value: 'optiboul' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() =>
      expect(identifier).toHaveBeenCalledWith({
        methode: 'email',
        email: 'davy.boulfaubourg@gmail.com',
        motDePasse: 'optiboul',
      }),
    );
  });

  it('refuse des identifiants faux et vide le mot de passe', async () => {
    identifier.mockRejectedValue(new Error('refusé'));
    fireEvent.change(champEmail(), { target: { value: 'davy.boulfaubourg@gmail.com' } });
    fireEvent.change(champMotDePasse(), { target: { value: 'mauvais' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('E-mail ou mot de passe incorrect.')).toBeTruthy();
    expect(champMotDePasse().value).toBe('');
  });

  it('affiche et masque le mot de passe', () => {
    expect(champMotDePasse().type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }));
    expect(champMotDePasse().type).toBe('text');
    expect(screen.getByRole('button', { name: 'Masquer' })).toBeTruthy();
  });

  it('annonce l’envoi du lien de réinitialisation', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(
      await screen.findByText('Lien de réinitialisation envoyé à votre adresse e-mail'),
    ).toBeTruthy();
  });
});
