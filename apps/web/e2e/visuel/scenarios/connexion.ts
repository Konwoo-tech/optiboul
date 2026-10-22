import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Scenario } from '../scenario.ts';

// ---------------------------------------------------------------------------
// Connexion « Nom et code » (sans double authentification)
// ---------------------------------------------------------------------------

const prototypeCode = async (page: Page, adresse: string) => {
  await page.goto(adresse);
  await attendrePolices(page);
};

// Le prototype démarre en clair ; l'application passe en sombre la nuit (O16) : on force le clair.
const applicationCode = async (page: Page, adresse: string) => {
  await page.goto(`${adresse}/connexion?mode=code&deuxFacteurs=0`);
  await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
};

const liste: Scenario = definirScenario({
  nom: 'connexion-liste',
  variante: 'code',
  prototype: (page, env) => prototypeCode(page, env.urlPrototype),
  application: async (page, env) => {
    await applicationCode(page, env.urlApplication);
    await cliquer(page, 'Clair');
    await page.waitForTimeout(300);
    await attendrePolices(page);
  },
});

const code: Scenario = definirScenario({
  nom: 'connexion-code',
  variante: 'code',
  prototype: async (page, env) => {
    await prototypeCode(page, env.urlPrototype);
    await cliquer(page, /Davy/);
    await page.waitForTimeout(300);
  },
  application: async (page, env) => {
    await applicationCode(page, env.urlApplication);
    await cliquer(page, 'Clair');
    await cliquer(page, /Davy/);
    await page.waitForTimeout(300);
    await attendrePolices(page);
  },
});

const sombre: Scenario = definirScenario({
  nom: 'connexion-sombre',
  variante: 'code',
  theme: 'sombre',
  prototype: async (page, env) => {
    await prototypeCode(page, env.urlPrototype);
    await cliquer(page, 'Sombre');
    await page.waitForTimeout(300);
  },
  application: async (page, env) => {
    await applicationCode(page, env.urlApplication);
    await cliquer(page, 'Sombre');
    await page.waitForTimeout(300);
    await attendrePolices(page);
  },
});

// ---------------------------------------------------------------------------
// Connexion « Google ou e-mail » avec double authentification
// ---------------------------------------------------------------------------

const prototypeEmail = async (page: Page, adresse: string) => {
  await page.goto(adresse);
  await page.getByRole('heading', { name: 'Connexion' }).waitFor({ timeout: 15_000 });
  await attendrePolices(page);
};

const applicationEmail = async (page: Page, adresse: string) => {
  await page.goto(`${adresse}/connexion`);
  await page.getByRole('heading', { name: 'Connexion' }).waitFor();
  await cliquer(page, 'Clair');
  await page.waitForTimeout(300);
  await attendrePolices(page);
};

const envoyerLeCode = async (page: Page) => {
  await cliquer(page, /Davy/);
  await cliquer(page, 'Se connecter');
  await cliquer(page, /Envoyer le code par SMS/);
};

const email: Scenario = definirScenario({
  nom: 'connexion-email',
  variante: 'email',
  prototype: (page, env) => prototypeEmail(page, env.urlPrototype),
  application: (page, env) => applicationEmail(page, env.urlApplication),
});

const erreur: Scenario = definirScenario({
  nom: 'connexion-erreur',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await cliquer(page, 'Se connecter');
    await page.waitForTimeout(200);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await cliquer(page, 'Se connecter');
    await page.waitForTimeout(200);
  },
});

const profil: Scenario = definirScenario({
  nom: 'connexion-profil',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await cliquer(page, /Davy/);
    await page.waitForTimeout(200);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await cliquer(page, /Davy/);
    await page.waitForTimeout(200);
  },
});

const google: Scenario = definirScenario({
  nom: 'connexion-google',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await cliquer(page, 'Continuer avec Google');
    await page.waitForTimeout(300);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await cliquer(page, 'Continuer avec Google');
    await page.waitForTimeout(300);
  },
});

const avantEnvoi: Scenario = definirScenario({
  nom: 'deux-etapes-avant-envoi',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await cliquer(page, /Davy/);
    await cliquer(page, 'Se connecter');
    await page.waitForTimeout(400);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await cliquer(page, /Davy/);
    await cliquer(page, 'Se connecter');
    await page.getByText('Vérification en deux étapes').waitFor();
    await page.waitForTimeout(400);
  },
});

const apresEnvoi: Scenario = definirScenario({
  nom: 'deux-etapes-apres-envoi',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await envoyerLeCode(page);
    await page.waitForTimeout(600);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await envoyerLeCode(page);
    await page.getByText(/Valable 5 minutes/).waitFor();
    await page.waitForTimeout(600);
  },
});

const codeFaux: Scenario = definirScenario({
  nom: 'deux-etapes-code-faux',
  variante: 'email',
  prototype: async (page, env) => {
    await prototypeEmail(page, env.urlPrototype);
    await envoyerLeCode(page);
    await page.waitForTimeout(300);
    await page.getByLabel('Code à 6 chiffres').click();
    await page.keyboard.type('000000');
    await page.waitForTimeout(700);
  },
  application: async (page, env) => {
    await applicationEmail(page, env.urlApplication);
    await envoyerLeCode(page);
    await page.getByText(/Valable 5 minutes/).waitFor();
    await page.waitForTimeout(300);
    await page.keyboard.type('000000');
    await page.getByText(/Encore 2 essai/).waitFor();
    await page.waitForTimeout(400);
  },
});

export const scenariosConnexion: Scenario[] = [
  liste,
  code,
  sombre,
  email,
  erreur,
  profil,
  google,
  avantEnvoi,
  apresEnvoi,
  codeFaux,
];
