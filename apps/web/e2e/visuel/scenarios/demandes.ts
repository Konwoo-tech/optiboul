import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Jouer, type Scenario } from '../scenario.ts';

/*
 * Écran « Demandes » (US-070, US-071), comparé au bloc `scr.demandes` du prototype. Seule la zone
 * de contenu est comparée : le menu de gauche (3 espaces au lieu de la barre plate) et le titre
 * d'accueil du gérant diffèrent volontairement. Un état par cas du prototype : liste vide de la
 * caissière, demande que le gérant ne peut pas trancher, accord et refus du propriétaire, demande
 * de plafond venue de la session (en attente chez la caissière, à autoriser chez le gérant).
 */

const CONTENU = { x: 248, y: 130, width: 1032, height: 670 };

type Utilisateur = 'Davy' | 'Willy' | 'M. Fotso';
type Suite = (page: Page) => Promise<void>;

const masquerLeBandeauDeSimulation = (page: Page) =>
  page.addStyleTag({ content: '[data-simulation]{display:none!important}' });

const pause = (page: Page) => page.waitForTimeout(500);

async function connecterPrototype(page: Page, url: string, utilisateur: Utilisateur) {
  await page.goto(url);
  await attendrePolices(page);
  await cliquer(page, new RegExp(utilisateur));
  for (const chiffre of '1234') await cliquer(page, chiffre);
  await page.waitForTimeout(700);
}

async function connecterApplication(page: Page, url: string, utilisateur: Utilisateur) {
  await page.goto(`${url}/connexion?mode=code&deuxFacteurs=0`);
  await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
  await cliquer(page, 'Clair');
  await cliquer(page, new RegExp(utilisateur));
  for (const chiffre of '1234') await cliquer(page, chiffre);
}

/** Davy demande l'autorisation de livrer 30 BAG à Brice, qui dépasse le plafond (côté prototype). */
async function demanderLePlafondPrototype(page: Page) {
  await page.getByText('Brice', { exact: true }).first().click();
  await page.locator('input[placeholder="0"]').nth(0).fill('30');
  await page.locator('input[placeholder="0"]').nth(3).fill('1000');
  await page.waitForTimeout(250);
  await cliquer(page, 'Demander l’autorisation du gérant');
  await page.waitForTimeout(250);
  await cliquer(page, 'Laisser en attente');
  await page.waitForTimeout(250);
}

async function demanderLePlafondApplication(page: Page) {
  await page
    .getByRole('button', { name: /^Brice/ })
    .first()
    .click();
  await page.locator('input[placeholder="0"]').nth(0).fill('30');
  await page.locator('input[placeholder="0"]').nth(3).fill('1000');
  await page.waitForTimeout(250);
  await cliquer(page, 'Demander l’autorisation du gérant');
  await page.waitForTimeout(250);
  await cliquer(page, 'Laisser en attente');
  await page.waitForTimeout(250);
}

type Options = {
  /** Utilisateur qui regarde l'écran. */
  utilisateur: Utilisateur;
  /** Une caissière a déjà demandé un dépassement de plafond depuis la session. */
  plafond?: boolean;
  prototype?: Suite;
  application?: Suite;
};

const prototypeDemandes =
  ({ utilisateur, plafond, prototype }: Options): Jouer =>
  async (page, env) => {
    await connecterPrototype(page, env.urlPrototype, plafond ? 'Davy' : utilisateur);
    if (plafond) {
      await cliquer(page, /^Session en cours/);
      await demanderLePlafondPrototype(page);
      if (utilisateur !== 'Davy') {
        await cliquer(page, 'Changer d’utilisateur');
        await page.waitForTimeout(500);
        await cliquer(page, new RegExp(utilisateur));
        for (const chiffre of '1234') await cliquer(page, chiffre);
        await page.waitForTimeout(700);
      }
    }
    await cliquer(page, /^Demandes/);
    await page.getByText('Décisions récentes', { exact: true }).waitFor();
    await pause(page);
    await prototype?.(page);
  };

const applicationDemandes =
  ({ utilisateur, plafond, application }: Options): Jouer =>
  async (page, env) => {
    await connecterApplication(page, env.urlApplication, plafond ? 'Davy' : utilisateur);
    if (plafond) {
      await page.getByRole('tab', { name: 'Livraisons' }).waitFor();
      await demanderLePlafondApplication(page);
      if (utilisateur !== 'Davy') {
        await cliquer(page, 'Changer d’utilisateur');
        await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
        await cliquer(page, 'Clair');
        await cliquer(page, new RegExp(utilisateur));
        for (const chiffre of '1234') await cliquer(page, chiffre);
      }
    }
    // Le gérant rouvre la session dans le comptoir : ses demandes sont dans la gestion.
    if (plafond && utilisateur !== 'Davy') {
      await page.getByRole('link', { name: 'Gestion', exact: true }).click();
    }
    await page
      .getByRole('link', { name: /^Demandes/ })
      .first()
      .click();
    await page.getByRole('heading', { name: 'Décisions récentes' }).waitFor();
    await masquerLeBandeauDeSimulation(page);
    await pause(page);
    await attendrePolices(page);
    await application?.(page);
    // Le focus du clavier n'existe pas dans le prototype.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  };

const scenario = (nom: string, options: Options): Scenario =>
  definirScenario({
    nom,
    variante: 'code',
    zones: { contenu: CONTENU },
    prototype: prototypeDemandes(options),
    application: applicationDemandes(options),
  });

/** Même geste des deux côtés : le prototype nomme le bouton « Valider », l'application « Valider DEM-021 ». */
const decider = (libelle: string, code: string) => ({
  prototype: async (page: Page) => {
    await cliquer(page, new RegExp(`^${libelle}$`));
    await pause(page);
  },
  application: async (page: Page) => {
    await page.getByRole('button', { name: `${libelle} ${code}` }).click();
    await pause(page);
  },
});

export const scenariosDemandes: Scenario[] = [
  // Aucune demande : les deux listes sont vides.
  scenario('demandes-caissiere-vide', { utilisateur: 'Davy' }),
  // La dépense de Willy attend le propriétaire : le gérant ne peut que patienter.
  scenario('demandes-gerant-en-attente', { utilisateur: 'Willy' }),
  scenario('demandes-proprietaire-en-attente', { utilisateur: 'M. Fotso' }),
  scenario('demandes-proprietaire-accord', {
    utilisateur: 'M. Fotso',
    ...decider('Valider', 'DEM-021'),
  }),
  scenario('demandes-proprietaire-refus', {
    utilisateur: 'M. Fotso',
    ...decider('Refuser', 'DEM-021'),
  }),
  // Plafond : la caissière suit sa demande, le gérant peut l'autoriser ou la refuser.
  scenario('demandes-plafond-caissiere', { utilisateur: 'Davy', plafond: true }),
  scenario('demandes-plafond-gerant', { utilisateur: 'Willy', plafond: true }),
  scenario('demandes-plafond-autorise', {
    utilisateur: 'Willy',
    plafond: true,
    ...decider('Autoriser', 'DEM-022'),
  }),
];
