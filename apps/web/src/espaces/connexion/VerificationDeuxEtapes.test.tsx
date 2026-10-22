import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import {
  CODE_OTP_DEMO,
  identifier,
  installerApiSimulee,
  type ReponseIdentification,
} from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { OptiboulProvider } from '@/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VerificationDeuxEtapes, type EnAttente } from './VerificationDeuxEtapes.tsx';

let retablir: () => void;
const surRetour = vi.fn();
const surTermine = vi.fn();

async function ouvrir() {
  const reponse: ReponseIdentification = await identifier(
    { methode: 'email', email: 'davy.boulfaubourg@gmail.com', motDePasse: 'optiboul' },
    true,
  );
  render(
    <OptiboulProvider>
      <VerificationDeuxEtapes
        attente={reponse as EnAttente}
        onRetour={surRetour}
        onTermine={surTermine}
      />
    </OptiboulProvider>,
  );
}

beforeEach(async () => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  surRetour.mockReset();
  surTermine.mockReset();
  await ouvrir();
});
afterEach(() => retablir());

const champCode = () => screen.findByLabelText('Code à 6 chiffres') as Promise<HTMLInputElement>;

async function envoyerLeCode() {
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer le code par SMS' }));
  return champCode();
}

async function saisirCode(champ: HTMLInputElement, code: string) {
  fireEvent.change(champ, { target: { value: code } });
}

describe('vérification en deux étapes', () => {
  it('rappelle qui se connecte, comment, et où part le code', () => {
    expect(screen.getByText('Vérification en deux étapes')).toBeTruthy();
    expect(
      screen.getByText('Étape 2 sur 2 · Davy, identifié par e-mail (davy.boulfaubourg@gmail.com)'),
    ).toBeTruthy();
    expect(screen.getAllByText('+237 6 •• •• 20 18')).toHaveLength(2);
  });

  it('envoie le code par SMS puis montre où et quand il est parti', async () => {
    await envoyerLeCode();
    expect(
      await screen.findByText(
        /Code envoyé par SMS au \+237 6 •• •• 20 18 à \d\d:\d\d\. Valable 5 minutes\./,
      ),
    ).toBeTruthy();
    expect(await screen.findByText('Code envoyé par SMS', { selector: 'output' })).toBeTruthy();
  });

  it('ouvre la session avec le bon code, sans cliquer sur Vérifier', async () => {
    const champ = await envoyerLeCode();
    await saisirCode(champ, CODE_OTP_DEMO);
    await waitFor(() => expect(surTermine).toHaveBeenCalledTimes(1));
  });

  it('compte les essais puis bloque la saisie', async () => {
    const champ = await envoyerLeCode();
    await saisirCode(champ, '000000');
    expect(await screen.findByText('Code incorrect. Encore 2 essai(s).')).toBeTruthy();
    await saisirCode(champ, '111111');
    expect(await screen.findByText('Code incorrect. Encore 1 essai(s).')).toBeTruthy();
    await saisirCode(champ, '222222');
    expect(await screen.findByText('Trop d’essais. Demandez un nouveau code.')).toBeTruthy();
    await waitFor(() => expect(champ.disabled).toBe(true));
    expect(surTermine).not.toHaveBeenCalled();
  });

  it('demande les 6 chiffres quand le code est incomplet', async () => {
    await envoyerLeCode();
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et se connecter' }));
    expect(await screen.findByText('Saisissez les 6 chiffres reçus.')).toBeTruthy();
  });

  it('propose l’autre canal et renvoie le code par WhatsApp', async () => {
    await envoyerLeCode();
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir plutôt par WhatsApp' }));
    expect(await screen.findByText(/Code envoyé par WhatsApp au/)).toBeTruthy();
  });

  it('attend 30 secondes avant de renvoyer le code', async () => {
    await envoyerLeCode();
    const renvoyer = await screen.findByRole('button', { name: /Renvoyer le code dans \d+ s/ });
    expect((renvoyer as HTMLButtonElement).disabled).toBe(true);
  });

  it('revient à l’identification', () => {
    fireEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(surRetour).toHaveBeenCalledTimes(1);
  });
});
