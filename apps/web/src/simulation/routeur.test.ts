import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CODE_DEMO, CODE_OTP_DEMO, MOT_DE_PASSE_DEMO } from './donnees.ts';
import { installerApiSimulee, masquerTelephone, reinitialiserSimulation } from './routeur.ts';

const appeler = (chemin: string, corps?: object) =>
  fetch(`http://localhost${chemin}`, {
    method: corps ? 'POST' : 'GET',
    body: corps ? JSON.stringify(corps) : undefined,
  });
const moi = () => appeler('/api/v1/users/me/');
const identifier = (corps: object, deuxFacteurs = true) =>
  appeler('/api/v1/simulation/identification/', { ...corps, deuxFacteurs });
const parEmail = {
  methode: 'email',
  email: 'davy.boulfaubourg@gmail.com',
  motDePasse: MOT_DE_PASSE_DEMO,
};
const envoyer = (canal = 'sms') => appeler('/api/v1/simulation/otp/envoyer/', { canal });
const verifier = (code: string) => appeler('/api/v1/simulation/otp/verifier/', { code });

describe('API simulée', () => {
  let retablir: () => void;
  const fetchReel = vi.fn(async () => new Response('police'));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchReel);
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
    fetchReel.mockClear();
  });

  it('refuse /users/me/ tant que personne n’est connecté', async () => {
    expect((await moi()).status).toBe(403);
  });

  it('liste neuf comptes sans jamais exposer un téléphone', async () => {
    const comptes = (await (await appeler('/api/v1/simulation/utilisateurs/')).json()) as object[];
    expect(comptes).toHaveLength(9);
    expect(JSON.stringify(comptes)).not.toMatch(/telephone|6 77 41/);
  });

  it('masque le téléphone comme la maquette', () => {
    expect(masquerTelephone('6 77 41 20 18')).toBe('+237 6 •• •• 20 18');
  });

  describe('connexion par e-mail', () => {
    it('refuse un mauvais mot de passe', async () => {
      const reponse = await identifier({ ...parEmail, motDePasse: 'x' });
      expect(reponse.status).toBe(400);
      expect(await reponse.json()).toMatchObject({ code: 'identifiants_incorrects' });
    });

    it('accepte l’adresse en majuscules et avec des espaces', async () => {
      const reponse = await identifier({ ...parEmail, email: '  DAVY.boulfaubourg@gmail.com ' });
      expect(reponse.status).toBe(200);
    });

    it('sans double authentification, ouvre la session', async () => {
      const reponse = await identifier(parEmail, false);
      expect(await reponse.json()).toEqual({ deuxFacteurs: false });
      expect(await (await moi()).json()).toMatchObject({ name: 'Davy', profil: 'caissier' });
    });
  });

  describe('connexion par Google et par code', () => {
    it('refuse un compte Google inconnu', async () => {
      const reponse = await identifier({ methode: 'google', email: 'inconnu@gmail.com' });
      expect(reponse.status).toBe(400);
    });

    it('connecte par code à 4 chiffres, sans double authentification', async () => {
      const reponse = await identifier(
        { methode: 'code', utilisateur: 'willy', code: CODE_DEMO },
        false,
      );
      expect(reponse.status).toBe(200);
      expect(await (await moi()).json()).toMatchObject({ name: 'Willy', profil: 'gerant' });
    });

    it('refuse un mauvais code à 4 chiffres', async () => {
      const reponse = await identifier({ methode: 'code', utilisateur: 'willy', code: '0000' });
      expect(await reponse.json()).toMatchObject({ code: 'code_incorrect' });
    });
  });

  describe('double authentification', () => {
    it('attend le code : la session n’est pas ouverte après l’identification', async () => {
      const reponse = await identifier(parEmail);
      expect(await reponse.json()).toMatchObject({
        deuxFacteurs: true,
        telephoneMasque: '+237 6 •• •• 20 18',
        via: 'e-mail',
        utilisateur: { id: 'davy' },
      });
      expect((await moi()).status).toBe(403);
    });

    it('refuse d’envoyer un code sans identification', async () => {
      expect((await envoyer()).status).toBe(409);
    });

    it('refuse de vérifier avant l’envoi', async () => {
      await identifier(parEmail);
      expect((await verifier(CODE_OTP_DEMO)).status).toBe(409);
    });

    it('ouvre la session avec le bon code', async () => {
      await identifier(parEmail);
      expect((await envoyer('whatsapp')).status).toBe(200);
      expect((await verifier(CODE_OTP_DEMO)).status).toBe(204);
      expect((await moi()).status).toBe(200);
    });

    it('compte les essais, puis bloque après trois erreurs', async () => {
      await identifier(parEmail);
      await envoyer();
      const premiere = await (await verifier('000000')).json();
      const deuxieme = await (await verifier('000000')).json();
      const troisieme = await (await verifier('000000')).json();
      expect([premiere, deuxieme, troisieme]).toMatchObject([
        { code: 'code_incorrect', essaisRestants: 2 },
        { code: 'code_incorrect', essaisRestants: 1 },
        { code: 'trop_d_essais', essaisRestants: 0 },
      ]);
      // Même le bon code est refusé : il faut en demander un nouveau.
      expect((await verifier(CODE_OTP_DEMO)).status).toBe(400);
      await envoyer();
      expect((await verifier(CODE_OTP_DEMO)).status).toBe(204);
    });

    it('annule l’identification en attente', async () => {
      await identifier(parEmail);
      await appeler('/api/v1/simulation/identification/annuler/', {});
      expect((await envoyer()).status).toBe(409);
    });
  });

  it('déconnecte', async () => {
    await identifier(parEmail, false);
    await appeler('/api/v1/simulation/deconnexion/', {});
    expect((await moi()).status).toBe(403);
  });

  it('signale une route pas encore simulée au format RFC 9457', async () => {
    const reponse = await appeler('/api/v1/clients/');
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toMatchObject({ code: 'non_simule' });
  });

  it('laisse passer ce qui n’est pas l’API', async () => {
    await appeler('/assets/police.woff2');
    expect(fetchReel).toHaveBeenCalledTimes(1);
  });
});
