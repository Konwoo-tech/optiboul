import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Scenario, type Zone } from '../scenario.ts';

/*
 * Comptoir › Caisses (US-164, récits US-040 à US-044). On compare toute la zone à droite du menu :
 * l'en-tête et le contenu. Le menu de gauche (trois espaces au lieu de la barre plate) est un écart
 * assumé et reste hors zone.
 *
 * Fermer et rouvrir une caisse se font, dans le prototype, sur l'écran Session ; dans l'application
 * ils se font sur l'écran Caisses. Les scénarios jouent donc chaque côté à sa manière et comparent
 * le résultat : la liste des caisses.
 */

const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: 800 };

// Après une ouverture, une fermeture ou une réouverture, le badge des notifications (premier bouton de
// la rangée d'actions de l'en-tête, x 280-425) suit l'état de la session : les notifications sont
// calculées par la coque, pas par cet écran, et restent statiques en simulation. On le laisse hors
// zone ; la pastille « Session … ouverte/clôturée » et le reste de l'en-tête sont comparés.
const ZONES_APRES_ACTION: Record<string, Zone> = {
  titre: { x: 248, y: 0, width: 1032, height: 95 },
  pastilles: { x: 428, y: 96, width: 852, height: 48 },
  contenu: { x: 248, y: 145, width: 1032, height: 655 },
};

// Une caisse rouverte garde sa ligne fermée dans le tableau, comme le prototype ; mais les cartes ne
// la comptent pas deux fois (demande de relecture de #131), alors que le prototype la compte : les
// cartes (y 220-380 en vue gérant) sont donc hors zone, la barre et le tableau sont comparés.
const ZONES_REOUVERTURE: Record<string, Zone> = {
  titre: ZONES_APRES_ACTION.titre!,
  pastilles: ZONES_APRES_ACTION.pastilles!,
  barre: { x: 248, y: 145, width: 1032, height: 70 },
  tableau: { x: 248, y: 385, width: 1032, height: 415 },
};

type Personne = 'Davy' | 'Willy' | 'M. Fotso';

const connecterDansLePrototype = async (page: Page, adresse: string, personne: Personne) => {
  await page.goto(adresse);
  await attendrePolices(page);
  await cliquer(page, new RegExp(personne.replace('.', '\\.')));
  for (const chiffre of '1234') await cliquer(page, chiffre);
  await page.getByRole('button', { name: 'Caisses', exact: true }).waitFor();
};

const connecterDansLApplication = async (page: Page, adresse: string, personne: Personne) => {
  await page.goto(`${adresse}/connexion?mode=code&deuxFacteurs=0`);
  await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
  await cliquer(page, 'Clair');
  await cliquer(page, new RegExp(personne.replace('.', '\\.')));
  for (const chiffre of '1234') await cliquer(page, chiffre);
  await page.getByRole('navigation').first().waitFor();
  // Le gérant et le propriétaire arrivent dans la gestion : le comptoir est un espace du menu.
  if (personne !== 'Davy') await page.getByRole('link', { name: 'Comptoir', exact: true }).click();
  await page.getByRole('link', { name: 'Caisses', exact: true }).click();
  await page.getByRole('table').waitFor();
};

const ouvrirLesCaissesDansLePrototype = (page: Page) =>
  page.getByRole('button', { name: 'Caisses', exact: true }).click();

/** Le bandeau « simulation » n'existe pas dans le prototype. */
const masquerLeBandeauDeSimulation = (page: Page) =>
  page.addStyleTag({ content: '[data-simulation]{display:none!important}' });

/** Fige l'état avant la capture : polices chargées, plus de focus, plus de message à l'écran. */
const stabiliser = async (page: Page, attenteMs = 500) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(attenteMs);
  await attendrePolices(page);
};

/** Les messages brefs durent 3 s : on les laisse partir pour comparer la page seule. */
const attendreLaFinDuMessage = (page: Page) => page.waitForTimeout(3_400);

const COMPTE = '22450';

/** Prototype : clôture de la session en cours depuis l'écran Session, puis retour aux caisses. */
const fermerDansLePrototype = async (page: Page) => {
  await page.getByRole('button', { name: 'Session en cours', exact: true }).click();
  await page.getByRole('button', { name: 'Clôture', exact: true }).click();
  await page.getByLabel('Espèces comptées').fill(COMPTE);
  await cliquer(page, 'Clôturer la session');
  await cliquer(page, 'Confirmer la clôture');
  await attendreLaFinDuMessage(page);
  await ouvrirLesCaissesDansLePrototype(page);
};

/** Application : fermeture depuis la bannière « Caisse ouverte ». */
const fermerDansLApplication = async (page: Page) => {
  await cliquer(page, 'Fermer la caisse');
  const fenetre = page.getByRole('dialog');
  await fenetre.getByLabel('Espèces comptées').fill(COMPTE);
  await fenetre.getByRole('button', { name: 'Fermer la caisse' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await attendreLaFinDuMessage(page);
};

const PROTOTYPE_VERS_LES_CAISSES = async (page: Page, adresse: string, personne: Personne) => {
  await connecterDansLePrototype(page, adresse, personne);
  await ouvrirLesCaissesDansLePrototype(page);
};

const scenario = (
  nom: string,
  personne: Personne,
  jouerPrototype: (page: Page) => Promise<void>,
  jouerApplication: (page: Page) => Promise<void>,
  autres: Partial<Scenario> = {},
): Scenario =>
  definirScenario({
    nom,
    variante: 'code',
    zones: { contenu: CONTENU },
    prototype: async (page, env) => {
      await PROTOTYPE_VERS_LES_CAISSES(page, env.urlPrototype, personne);
      await jouerPrototype(page);
      await stabiliser(page);
    },
    application: async (page, env) => {
      await connecterDansLApplication(page, env.urlApplication, personne);
      await masquerLeBandeauDeSimulation(page);
      await jouerApplication(page);
      await stabiliser(page);
    },
    ...autres,
  });

const rien = async () => {};

// Vue de la caissière : ses caisses et sa carte seulement, caisse ouverte avec sa bannière.
const caissier = scenario('caisses-caissier', 'Davy', rien, rien);

// Vue du gérant : toutes les caissières, le filtre, les deux cartes.
const gerant = scenario('caisses-gerant', 'Willy', rien, rien);

const filtrerRachel = (page: Page) =>
  page.getByRole('button', { name: 'Rachel', exact: true }).click();
const gerantFiltre = scenario('caisses-gerant-filtre', 'Willy', filtrerRachel, filtrerRachel);

// Vue du propriétaire : voit tout, en lecture seule (CdC §3.3) : pas de bouton « Fermer la caisse »,
// que le prototype lui montre. On compare le titre, l'en-tête et ce qui est sous la barre d'actions.
const proprietaire = scenario('caisses-proprietaire', 'M. Fotso', rien, rien, {
  zones: {
    titre: { x: 248, y: 0, width: 1032, height: 95 },
    pastilles: { x: 428, y: 96, width: 852, height: 48 },
    'sous-la-barre': { x: 248, y: 215, width: 1032, height: 585 },
  },
});

// Après la fermeture par la caissière : « Ouvrir la caisse · jour 15 oct. » remplace la bannière.
const fermeture = scenario(
  'caisses-fermeture',
  'Davy',
  fermerDansLePrototype,
  fermerDansLApplication,
  { zones: ZONES_APRES_ACTION },
);

const OUVRIR = /^Ouvrir la caisse · jour 15 oct\.$/;

// Modale d'ouverture, avec le fonds proposé et l'alerte « pas la personne planifiée » (Davy ≠ Rachel).
const modaleOuverture = scenario(
  'caisses-modale-ouverture',
  'Davy',
  async (page) => {
    await fermerDansLePrototype(page);
    await cliquer(page, OUVRIR);
    await page.waitForTimeout(300);
  },
  async (page) => {
    await fermerDansLApplication(page);
    await cliquer(page, OUVRIR);
    await page.waitForTimeout(300);
  },
  { zones: ZONES_APRES_ACTION },
);

// Caisse ouverte pour la session de jour du 15 octobre, avec sa bannière « Caisse ouverte ».
const caisseOuverte = scenario(
  'caisses-ouverte',
  'Davy',
  async (page) => {
    await fermerDansLePrototype(page);
    await cliquer(page, OUVRIR);
    await page.getByRole('button', { name: 'Ouvrir la caisse', exact: true }).click();
    await attendreLaFinDuMessage(page);
  },
  async (page) => {
    await fermerDansLApplication(page);
    await cliquer(page, OUVRIR);
    await page.getByRole('dialog').getByRole('button', { name: 'Ouvrir la caisse' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await attendreLaFinDuMessage(page);
  },
  { zones: ZONES_APRES_ACTION },
);

// Réouverture par le gérant : la caisse fermée repasse en « Ouverte », la ligne fermée est conservée.
const reouverture = scenario(
  'caisses-reouverture',
  'Willy',
  async (page) => {
    await fermerDansLePrototype(page);
    await page.getByRole('button', { name: 'Session en cours', exact: true }).click();
    await cliquer(page, 'Rouvrir la session');
    await attendreLaFinDuMessage(page);
    await ouvrirLesCaissesDansLePrototype(page);
  },
  async (page) => {
    await fermerDansLApplication(page);
    await cliquer(page, 'Rouvrir la caisse');
    const fenetre = page.getByRole('dialog');
    await fenetre.getByLabel('Motif de la réouverture').fill('Erreur de comptage');
    await fenetre.getByRole('button', { name: 'Rouvrir la caisse' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await attendreLaFinDuMessage(page);
  },
  { zones: ZONES_REOUVERTURE },
);

// Vue du gérant en anglais et en thème sombre : textes, dates et palette suivent le prototype.
const basculerEn = async (page: Page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};
const gerantEn = scenario('caisses-gerant-en', 'Willy', basculerEn, basculerEn);

const basculerSombre = async (page: Page) => {
  await page.getByRole('button', { name: 'Sombre', exact: true }).click();
  await page.waitForTimeout(300);
};
const gerantSombre = scenario('caisses-gerant-sombre', 'Willy', basculerSombre, basculerSombre);

// Espèces au-delà du plafond de 100 000 FCFA (US-041). Le prototype n'a ni rappel du plafond ni remise
// au coffre : on compare les cartes et le tableau, sous la barre d'actions où l'application ajoute
// « Plus de 100 000 FCFA en caisse » et « Remettre au coffre ». Dans le prototype, les espèces
// viennent d'une livraison payée comptant ; dans l'application, de l'aide de simulation.
const livrerAuComptantDansLePrototype = async (page: Page) => {
  await page.getByRole('button', { name: 'Session en cours', exact: true }).click();
  await page.getByRole('button', { name: 'Livraisons', exact: true }).click();
  await page.getByRole('button', { name: /^Clarisse/ }).click();
  await page.getByPlaceholder('0').first().fill('800');
  await cliquer(page, 'Exact');
  await cliquer(page, 'Valider la livraison');
  await attendreLaFinDuMessage(page);
  await ouvrirLesCaissesDansLePrototype(page);
};
const encaisserDansLApplication = async (page: Page) => {
  await page.evaluate(() =>
    fetch('/api/v1/simulation/caisses/encaissements/', {
      method: 'POST',
      body: JSON.stringify({ especes: 80000 }),
    }),
  );
  // Quitter l'écran puis y revenir relit les caisses.
  await page.getByRole('link', { name: 'Session en cours', exact: true }).click();
  await page.getByRole('link', { name: 'Caisses', exact: true }).click();
  await page.getByRole('cell', { name: /102\s950/ }).waitFor();
};
const plafondDepasse = scenario(
  'caisses-plafond-depasse',
  'Davy',
  livrerAuComptantDansLePrototype,
  encaisserDansLApplication,
  { zones: { 'cartes-tableau': { x: 248, y: 215, width: 1032, height: 585 } } },
);

export const scenariosCaisses: Scenario[] = [
  caissier,
  gerant,
  gerantFiltre,
  proprietaire,
  fermeture,
  modaleOuverture,
  caisseOuverte,
  reouverture,
  gerantEn,
  gerantSombre,
  plafondDepasse,
];
