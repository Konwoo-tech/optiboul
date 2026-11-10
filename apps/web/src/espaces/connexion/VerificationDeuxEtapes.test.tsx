import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import {
  CODE_OTP_DEMO,
  envoyerCodeOtp,
  identifier,
  installerApiSimulee,
  texteDemo,
  verifierCodeOtp,
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
        envoyerCode={envoyerCodeOtp}
        verifierCode={verifierCodeOtp}
        aide={texteDemo('otpDemo', 'fr')}
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

  it('désactive le renvoi du code juste après l’envoi', async () => {
    await envoyerLeCode();
    const renvoyer = await screen.findByRole('button', { name: /Renvoyer le code dans \d+ s/ });
    expect((renvoyer as HTMLButtonElement).disabled).toBe(true);
  });

  it('revient à l’identification', () => {
    fireEvent.click(screen.getByRole('button', { name: '← Retour' }));
    expect(surRetour).toHaveBeenCalledTimes(1);
  });

  describe('courses', () => {
    const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it('valider tout de suite ne vérifie pas le code deux fois (un seul essai compté)', async () => {
      const champ = await envoyerLeCode();
      fireEvent.change(champ, { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier et se connecter' }));
      expect(await screen.findByText('Code incorrect. Encore 2 essai(s).')).toBeTruthy();
      await attendre(400);
      expect(screen.getByText('Code incorrect. Encore 2 essai(s).')).toBeTruthy();
    });

    it('le bon code validé tout de suite ouvre la session une seule fois', async () => {
      const champ = await envoyerLeCode();
      fireEvent.change(champ, { target: { value: CODE_OTP_DEMO } });
      fireEvent.keyDown(champ, { key: 'Enter' });
      await waitFor(() => expect(surTermine).toHaveBeenCalledTimes(1));
      await attendre(400);
      expect(surTermine).toHaveBeenCalledTimes(1);
    });

    it('« Retour » pendant le délai annule la vérification', async () => {
      const champ = await envoyerLeCode();
      fireEvent.change(champ, { target: { value: CODE_OTP_DEMO } });
      fireEvent.click(screen.getByRole('button', { name: '← Retour' }));
      await attendre(400);
      expect(surRetour).toHaveBeenCalledTimes(1);
      expect(surTermine).not.toHaveBeenCalled();
    });
  });
});
