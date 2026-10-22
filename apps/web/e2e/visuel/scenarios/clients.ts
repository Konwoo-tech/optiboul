import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Jouer, type Scenario } from '../scenario.ts';

/*
 * Écran « Clients et dettes » (US-060 à US-064), comparé au bloc `scr.clients` du prototype.
 * Seule la zone de contenu est comparée : le menu de gauche (3 espaces au lieu de la barre
 * plate) et le titre d'accueil du gérant diffèrent volontairement.
 */

/** Contenu de la page, sous l'en-tête, à droite du menu de gauche (1280 x 800). */
const CONTENU = { x: 248, y: 130, width: 1032, height: 670 };

type Utilisateur = 'Davy' | 'Willy';

// Le bandeau « simulation » n'existe pas dans le prototype.
const masquerLeBandeauDeSimulation = (page: Page) =>
  page.addStyleTag({ content: '[data-simulation]{display:none!important}' });

/** Connexion « nom et code » 1234 puis ouverture de « Clients et dettes » dans le prototype. */
const prototypeClients =
  (utilisateur: Utilisateur, suite?: (page: Page) => Promise<void>): Jouer =>
  async (page, env) => {
    await page.goto(env.urlPrototype);
    await attendrePolices(page);
    await cliquer(page, new RegExp(utilisateur));
    for (const chiffre of '1234') await cliquer(page, chiffre);
    await cliquer(page, 'Clients et dettes');
    await page.getByText('Dettes clients', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    await suite?.(page);
  };

/** Même parcours dans l'application : le menu de gauche mène à « Clients et dettes ». */
const applicationClients =
  (utilisateur: Utilisateur, suite?: (page: Page) => Promise<void>): Jouer =>
  async (page, env) => {
    await page.goto(`${env.urlApplication}/connexion?mode=code&deuxFacteurs=0`);
    await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
    await cliquer(page, 'Clair');
    await cliquer(page, new RegExp(utilisateur));
    for (const chiffre of '1234') await cliquer(page, chiffre);
    await page.getByRole('link', { name: 'Clients et dettes' }).click();
    await page.getByRole('list', { name: 'Liste des clients' }).waitFor();
    await masquerLeBandeauDeSimulation(page);
    await page.waitForTimeout(500);
    await attendrePolices(page);
    await suite?.(page);
    // Le focus du clavier n'existe pas dans le prototype.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  };

const scenario = (
  nom: string,
  utilisateur: Utilisateur,
  suite?: { prototype: (page: Page) => Promise<void>; application: (page: Page) => Promise<void> },
): Scenario =>
  definirScenario({
    nom,
    variante: 'code',
    zones: { contenu: CONTENU },
    prototype: prototypeClients(utilisateur, suite?.prototype),
    application: applicationClients(utilisateur, suite?.application),
  });

/** Même geste des deux côtés : clic sur un bouton (par nom), puis un instant de stabilité. */
const cliquerPuisAttendre = (nom: string | RegExp) => async (page: Page) => {
  await cliquer(page, nom);
  await page.waitForTimeout(500);
};

/** Choisit un client dans la liste : le prototype et l'application montrent le nom en texte. */
const choisirClient = (nom: string) => async (page: Page) => {
  await page.getByText(nom, { exact: true }).first().click();
  await page.waitForTimeout(600);
};

const memeGeste = (geste: (page: Page) => Promise<void>) => ({
  prototype: geste,
  application: geste,
});

export const scenariosClients: Scenario[] = [
  scenario('clients-liste-caissiere', 'Davy'),
  scenario('clients-liste-gerant', 'Willy'),
  scenario(
    'clients-filtre-dette',
    'Davy',
    memeGeste(cliquerPuisAttendre(/^À régler avant dimanche/)),
  ),
  scenario('clients-filtre-depasse', 'Willy', memeGeste(cliquerPuisAttendre(/^Plafond dépassé/))),
  // Les trois états de la jauge : dette sous le plafond, au-delà du plafond, à jour.
  scenario('clients-detail-dette', 'Davy', memeGeste(choisirClient('Alain'))),
  scenario('clients-detail-depasse', 'Willy', memeGeste(choisirClient('Brice'))),
  scenario('clients-detail-a-jour', 'Davy', memeGeste(choisirClient('Aïcha'))),
  // Livraison du jour dans l'historique et dette à solde partiel.
  scenario('clients-detail-livraison-du-jour', 'Davy', memeGeste(choisirClient('White'))),
  // Relance d'un client : message WhatsApp simulé, bouton « Relancé ».
  scenario('clients-relance-un', 'Willy', {
    prototype: async (page) => {
      await page.getByRole('button', { name: 'Relancer', exact: true }).first().click();
      await page.waitForTimeout(500);
    },
    // Dans l'application, le nom du client complète le libellé du bouton (lecteurs d'écran).
    application: async (page) => {
      await page.getByRole('button', { name: 'Relancer Brice', exact: true }).click();
      await page.waitForTimeout(500);
    },
  }),
  scenario(
    'clients-relance-tous',
    'Willy',
    memeGeste(async (page) => {
      await page.getByRole('button', { name: /^Relancer les 8 clients/ }).click();
      await page.waitForTimeout(500);
    }),
  ),
];
