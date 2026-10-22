import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CODE_DEMO, CODE_OTP_DEMO } from './donnees.ts';
import { lireConfiguration } from './configuration.ts';
import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';

const appeler = (chemin: string, corps?: object) =>
  fetch(`http://localhost${chemin}`, {
    method: corps ? 'POST' : 'GET',
    body: corps ? JSON.stringify(corps) : undefined,
  });
const identifier = (corps: object, deuxFacteurs = false) =>
  appeler('/api/v1/simulation/identification/', { ...corps, deuxFacteurs });

describe('API simulée : compléments', () => {
  let retablir: () => void;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('police')),
    );
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
  });

  it('connecte un compte Google connu, sans tenir compte de la casse', async () => {
    const reponse = await identifier({ methode: 'google', email: 'Willy.Boulfaubourg@gmail.com' });
    expect(reponse.status).toBe(200);
    expect(await (await appeler('/api/v1/users/me/')).json()).toMatchObject({ name: 'Willy' });
  });

  it('par code avec double authentification : attend le code, via « code »', async () => {
    const reponse = await identifier(
      { methode: 'code', utilisateur: 'serge', code: CODE_DEMO },
      true,
    );
    expect(await reponse.json()).toMatchObject({ deuxFacteurs: true, via: 'code' });
    expect((await appeler('/api/v1/users/me/')).status).toBe(403);
  });

  it('ne divulgue pas le téléphone dans la réponse d’identification', async () => {
    const reponse = await identifier(
      { methode: 'code', utilisateur: 'davy', code: CODE_DEMO },
      true,
    );
    expect(JSON.stringify(await reponse.json())).not.toMatch(/6 77 41|"telephone"/);
  });

  it('une nouvelle identification remplace celle qui attendait', async () => {
    await identifier({ methode: 'code', utilisateur: 'davy', code: CODE_DEMO }, true);
    await identifier({ methode: 'code', utilisateur: 'rachel', code: CODE_DEMO }, true);
    await appeler('/api/v1/simulation/otp/envoyer/', { canal: 'sms' });
    await appeler('/api/v1/simulation/otp/verifier/', { code: CODE_OTP_DEMO });
    expect(await (await appeler('/api/v1/users/me/')).json()).toMatchObject({ name: 'Rachel' });
  });

  describe('notifications', () => {
    it('sont refusées sans connexion', async () => {
      expect((await appeler('/api/v1/simulation/notifications/')).status).toBe(403);
      expect((await appeler('/api/v1/simulation/notifications/lues/', { ids: [] })).status).toBe(
        403,
      );
    });

    it('dépendent du profil', async () => {
      await identifier({ methode: 'code', utilisateur: 'davy', code: CODE_DEMO });
      const caissier = (await (
        await appeler('/api/v1/simulation/notifications/')
      ).json()) as unknown[];
      await identifier({ methode: 'code', utilisateur: 'admin', code: CODE_DEMO });
      const admin = (await (
        await appeler('/api/v1/simulation/notifications/')
      ).json()) as unknown[];
      expect([caissier.length, admin.length]).toEqual([4, 0]);
    });

    it('se marquent lues pour une seule personne', async () => {
      await identifier({ methode: 'code', utilisateur: 'davy', code: CODE_DEMO });
      const avant = (await (await appeler('/api/v1/simulation/notifications/')).json()) as {
        id: string;
        lue: boolean;
      }[];
      expect(avant.every((n) => !n.lue)).toBe(true);
      await appeler('/api/v1/simulation/notifications/lues/', { ids: [avant[0]!.id] });
      const apres = (await (await appeler('/api/v1/simulation/notifications/')).json()) as {
        lue: boolean;
      }[];
      expect(apres.filter((n) => n.lue)).toHaveLength(1);
      // Rachel a le même profil mais ses propres notifications.
      await identifier({ methode: 'code', utilisateur: 'rachel', code: CODE_DEMO });
      const rachel = (await (await appeler('/api/v1/simulation/notifications/')).json()) as {
        lue: boolean;
      }[];
      expect(rachel.every((n) => !n.lue)).toBe(true);
    });
  });
});

describe('réglages de la simulation dans l’adresse', () => {
  it('prend les valeurs de la maquette par défaut', () => {
    expect(lireConfiguration('')).toEqual({
      mode: 'email',
      deuxFacteurs: true,
      inactiviteMinutes: 10,
    });
  });

  it('lit ?mode, ?deuxFacteurs et ?inactivite', () => {
    expect(lireConfiguration('?mode=code&deuxFacteurs=0&inactivite=1')).toEqual({
      mode: 'code',
      deuxFacteurs: false,
      inactiviteMinutes: 1,
    });
  });

  it('ignore les valeurs absurdes', () => {
    expect(lireConfiguration('?mode=pirate&inactivite=-5').inactiviteMinutes).toBe(10);
    expect(lireConfiguration('?mode=pirate').mode).toBe('email');
  });
});
