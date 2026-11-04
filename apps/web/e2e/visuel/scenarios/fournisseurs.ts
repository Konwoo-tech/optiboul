import type { Page } from '@playwright/test';

import { attendrePolices } from '../outils.ts';
import { definirScenario, type Scenario, type Zone } from '../scenario.ts';
import {
  attendreFinDuToast,
  cliquerTexte,
  connecterLApplication,
  connecterLePrototype,
  masquerLeBandeauDeSimulation,
} from './session.ts';

/*
 * Gestion › Fournisseurs (US-173), comparé au bloc `scr.fournisseurs` du prototype : les trois
 * onglets, les fenêtres de réception et de paiement, la planification (erreur, ajout), la
 * réception complète ou partielle, le reliquat, le paiement, le propriétaire en lecture, l'anglais
 * et le thème sombre. Toute la zone de contenu est comparée, en-tête compris ; le menu de gauche
 * ne l'est pas (trois espaces au lieu de la barre plate).
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion et
 * l'arrivée sur l'écran diffèrent.
 */

const HAUTEUR = 1100;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

const remplir = async (page: Page, libelle: string, valeur: string) => {
  await page.getByLabel(libelle, { exact: true }).fill(valeur);
  await page.waitForTimeout(150);
};

const ONGLET_RECEPTIONS = 'Réceptions';
const ONGLET_FICHES = 'Fournisseurs';
const ONGLET_DETTES = 'Factures et dettes';

type Options = {
  nom: string;
  etapes?: Etapes;
  /** Profil qui se connecte (Willy, le gérant, par défaut). */
  profil?: RegExp;
  theme?: 'clair' | 'sombre';
  seuil?: number;
  justification?: string;
};

function scenarioFournisseurs(options: Options): Scenario {
  const { nom, etapes, profil = /Willy/ } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: { contenu: CONTENU },
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.seuil ? { seuil: options.seuil, justification: options.justification } : {}),
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await cliquerTexte(page, /^\s*Fournisseurs\s*$/);
      await page.getByRole('button', { name: ONGLET_RECEPTIONS, exact: true }).waitFor();
      await etapes?.(page);
      if (options.theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, profil);
      await page.waitForURL(/\/(comptoir|gestion|atelier)\//);
      await page.goto(`${env.urlApplication}/gestion/fournisseurs`);
      await page.getByRole('tab', { name: ONGLET_RECEPTIONS, exact: true }).waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes?.(page);
      if (options.theme === 'sombre') await cliquerTexte(page, 'Sombre');
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

/** L'onglet est le dernier bouton de ce nom : le menu du prototype a lui aussi un « Fournisseurs ». */
const onglet =
  (nomOnglet: string): Etapes =>
  async (page) => {
    await page
      .locator('button, [role="tab"]')
      .filter({ hasText: new RegExp(`^\\s*${nomOnglet}\\s*$`) })
      .last()
      .click();
    await page.waitForTimeout(250);
  };

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

/** La première réception à faire (BC-034) : le bouton jaune « Réceptionner » de la première ligne. */
const ouvrirReception: Etapes = (page) => cliquerTexte(page, 'Réceptionner');

const receptionPartielle: Etapes = async (page) => {
  await ouvrirReception(page);
  await remplir(page, 'Quantité réellement livrée', '5');
  await cliquerTexte(page, 'Valider la réception');
  await attendreFinDuToast(page);
};

const ouvrirPaiement: Etapes = async (page) => {
  await onglet(ONGLET_DETTES)(page);
  await cliquerTexte(page, 'Payer');
};

// Le prototype numérote les bons planifiés à partir de BC-044 (37 + nombre de bons) et l'application
// à la suite du dernier numéro (BC-037) : quelques glyphes du numéro diffèrent après une planification.
// Bruit de rendu de la parenthèse de « (44 sacs à ce jour) » (43 px), déjà vu sur develop, sans lien
// avec cet écran ; seuil minimal pour ne pas laisser le banc rouge.
const PARENTHESE = {
  seuil: 60,
  justification:
    'Bruit de rendu de la parenthèse de « (44 sacs à ce jour) » (43 px mesurés), présent aussi sur develop pour les parenthèses et les signes « − ».',
} as const;

const NUMERO_DE_BON = {
  seuil: 1000,
  justification:
    'Le prototype numérote le nouveau bon BC-044 (37 + nombre de bons), l’application BC-037 (suite du dernier numéro) : seuls les glyphes du numéro diffèrent.',
} as const;

export const scenariosFournisseurs: Scenario[] = [
  scenarioFournisseurs({ nom: 'fournisseurs-receptions' }),
  scenarioFournisseurs({ nom: 'fournisseurs-fiches', etapes: onglet(ONGLET_FICHES) }),
  scenarioFournisseurs({
    nom: 'fournisseurs-dettes',
    ...PARENTHESE,
    etapes: onglet(ONGLET_DETTES),
  }),
  scenarioFournisseurs({ nom: 'fournisseurs-modale-reception', etapes: ouvrirReception }),
  scenarioFournisseurs({
    nom: 'fournisseurs-reception-quantite-vide',
    etapes: async (page) => {
      await ouvrirReception(page);
      await remplir(page, 'Quantité réellement livrée', '0');
      await cliquerTexte(page, 'Valider la réception');
    },
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-reception-complete',
    etapes: async (page) => {
      await ouvrirReception(page);
      await cliquerTexte(page, 'Valider la réception');
      await attendreFinDuToast(page);
    },
  }),
  scenarioFournisseurs({ nom: 'fournisseurs-reception-partielle', etapes: receptionPartielle }),
  scenarioFournisseurs({
    nom: 'fournisseurs-reception-farine',
    ...PARENTHESE,
    etapes: async (page) => {
      // BC-033 : 40 sacs de farine, cumulés sur la facture de la semaine.
      await page
        .locator('button', { hasText: /^\s*Réceptionner\s*$/ })
        .nth(1)
        .click();
      await page.waitForTimeout(250);
      await cliquerTexte(page, 'Valider la réception');
      await attendreFinDuToast(page);
      await onglet(ONGLET_DETTES)(page);
    },
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-planification-erreur',
    etapes: async (page) => {
      await cliquerTexte(page, 'Planifier');
    },
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-planification',
    ...NUMERO_DE_BON,
    etapes: async (page) => {
      await remplir(page, 'Quantité commandée', '12');
      await cliquerTexte(page, 'Planifier');
      await attendreFinDuToast(page);
    },
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-reliquat',
    ...NUMERO_DE_BON,
    etapes: async (page) => {
      await cliquerTexte(page, 'Replanifier le reliquat');
      await attendreFinDuToast(page);
    },
  }),
  scenarioFournisseurs({ nom: 'fournisseurs-modale-paiement', etapes: ouvrirPaiement }),
  scenarioFournisseurs({
    nom: 'fournisseurs-paiement',
    ...PARENTHESE,
    etapes: async (page) => {
      await ouvrirPaiement(page);
      await cliquerTexte(page, 'Banque');
      await cliquerTexte(page, 'Enregistrer le paiement');
      await attendreFinDuToast(page);
    },
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-proprietaire-receptions',
    profil: /Fotso/,
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-proprietaire-dettes',
    ...PARENTHESE,
    profil: /Fotso/,
    etapes: onglet(ONGLET_DETTES),
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-receptions-sombre',
    theme: 'sombre',
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-fiches-sombre',
    theme: 'sombre',
    etapes: onglet(ONGLET_FICHES),
  }),
  scenarioFournisseurs({
    nom: 'fournisseurs-receptions-en',
    etapes: basculerEn,
  }),
];
