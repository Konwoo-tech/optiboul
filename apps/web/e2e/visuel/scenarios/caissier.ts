import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Scenario } from '../scenario.ts';

/** Connexion du caissier par nom et code 1234 (sans double authentification). */
const connecterLeCaissierDansLePrototype = async (page: Page, adresse: string) => {
  await page.goto(adresse);
  await attendrePolices(page);
  await cliquer(page, /Davy/);
  for (const chiffre of '1234') await cliquer(page, chiffre);
};

const connecterLeCaissierDansLApplication = async (page: Page, adresse: string) => {
  await page.goto(`${adresse}/connexion?mode=code&deuxFacteurs=0`);
  await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
  await cliquer(page, 'Clair');
  await cliquer(page, /Davy/);
  for (const chiffre of '1234') await cliquer(page, chiffre);
};

// Le bandeau « simulation » n'existe pas dans le prototype.
const masquerLeBandeauDeSimulation = (page: Page) =>
  page.addStyleTag({ content: '[data-simulation]{display:none!important}' });

const coque: Scenario = definirScenario({
  nom: 'coque-caissier',
  variante: 'code',
  zones: {
    'menu-gauche': { x: 0, y: 0, width: 248, height: 800 },
    entete: { x: 248, y: 0, width: 1032, height: 130 },
  },
  prototype: async (page, env) => {
    await connecterLeCaissierDansLePrototype(page, env.urlPrototype);
    await page.waitForTimeout(700);
  },
  application: async (page, env) => {
    await connecterLeCaissierDansLApplication(page, env.urlApplication);
    await page.waitForURL('**/comptoir/session');
    await masquerLeBandeauDeSimulation(page);
    await page.waitForTimeout(500);
    await attendrePolices(page);
  },
});

const tiroir: Scenario = definirScenario({
  nom: 'tiroir-caissier',
  variante: 'code',
  zones: {
    tiroir: { x: 840, y: 0, width: 440, height: 800 },
    entete: { x: 248, y: 0, width: 592, height: 130 },
  },
  prototype: async (page, env) => {
    await connecterLeCaissierDansLePrototype(page, env.urlPrototype);
    await page
      .getByRole('button', { name: /^Notifications/ })
      .first()
      .waitFor();
    await page.waitForTimeout(500);
    await cliquer(page, /^Notifications/);
    await page.waitForTimeout(400);
  },
  application: async (page, env) => {
    await connecterLeCaissierDansLApplication(page, env.urlApplication);
    await page
      .getByRole('button', { name: /^Notifications/ })
      .first()
      .waitFor();
    await masquerLeBandeauDeSimulation(page);
    await page.waitForTimeout(500);
    await cliquer(page, /^Notifications/);
    await page.waitForTimeout(400);
  },
});

export const scenariosCaissier: Scenario[] = [coque, tiroir];
