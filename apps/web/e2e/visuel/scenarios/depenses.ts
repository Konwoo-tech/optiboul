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
 * Comptoir › Dépenses (US-168), comparé au bloc `scr.depenses` du prototype : budget, formulaire
 * et liste, dans toute la zone de contenu (en-tête compris). Le menu de gauche n'est pas comparé
 * (trois espaces au lieu de la barre plate). La fenêtre est haute pour tenir la page entière.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion et
 * l'arrivée sur l'écran diffèrent.
 */

const HAUTEUR = 1500;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

const champ = (page: Page, libelle: string) => page.getByLabel(libelle, { exact: true });

const remplir = async (page: Page, libelle: string, valeur: string) => {
  await champ(page, libelle).fill(valeur);
  await page.waitForTimeout(150);
};

const choisir = async (page: Page, libelle: string, option: string) => {
  // Dans le prototype, le nom accessible du libellé inclut l'option choisie : on cible le <select>.
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${libelle}`) })
    .locator('select')
    .selectOption({ label: option });
  await page.waitForTimeout(150);
};

const enregistrer: Etapes = (page) => cliquerTexte(page, 'Enregistrer la dépense');

type Options = {
  nom: string;
  etapes: Etapes;
  /** Profil qui se connecte (Davy, la caissière, par défaut). */
  profil?: RegExp;
  zones?: Record<string, Zone>;
  /** Le gérant et le propriétaire ouvrent « Dépenses » dans la gestion. */
  espace?: 'comptoir' | 'gestion';
};

function scenarioDepenses(options: Options): Scenario {
  const { nom, etapes, profil = /Davy/, espace = 'comptoir' } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: options.zones ?? { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await cliquerTexte(page, /^\s*Dépenses\s*$/);
      await page.getByText('Nouvelle dépense', { exact: true }).waitFor();
      await etapes(page);
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, profil);
      await page.waitForURL(/\/(comptoir|gestion)\//);
      await page.goto(`${env.urlApplication}/${espace}/depenses`);
      await page.getByRole('heading', { name: 'Dépenses et budget' }).waitFor();
      await page.getByText('DEP-0016', { exact: false }).first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes(page);
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

/** Levure : 5 kg entrés en stock chez le fournisseur de levure. */
const stockLevure: Etapes = async (page) => {
  await cliquerTexte(page, 'Entrée de stock');
  await remplir(page, 'Libellé', 'Levure – 2 cartons');
  await remplir(page, 'Montant (FCFA)', '12000');
  await remplir(page, 'Quantité entrée', '2,5');
  await choisir(page, 'Fournisseur', 'Mfoundi Levures & Sel');
};

export const scenariosDepenses: Scenario[] = [
  scenarioDepenses({ nom: 'depenses', etapes: async () => {} }),
  scenarioDepenses({
    nom: 'depenses-stock',
    etapes: (page) => cliquerTexte(page, 'Entrée de stock'),
  }),
  scenarioDepenses({ nom: 'depenses-stock-saisi', etapes: stockLevure }),
  scenarioDepenses({
    nom: 'depenses-semaine-banque-photo',
    etapes: async (page) => {
      await cliquerTexte(page, /^Semaine 42 \(frais généraux\)$/);
      await cliquerTexte(page, 'Banque');
      await cliquerTexte(page, 'Prendre le justificatif en photo');
      await choisir(page, 'Catégorie', 'Électricité');
      await remplir(page, 'Libellé', 'Facture ENEO');
      await remplir(page, 'Montant (FCFA)', '90000');
    },
  }),
  scenarioDepenses({ nom: 'depenses-erreur-libelle', etapes: enregistrer }),
  scenarioDepenses({
    nom: 'depenses-erreur-montant',
    etapes: async (page) => {
      await remplir(page, 'Libellé', 'Sel');
      await enregistrer(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-erreur-quantite',
    etapes: async (page) => {
      await cliquerTexte(page, 'Entrée de stock');
      await remplir(page, 'Libellé', 'Sel');
      await remplir(page, 'Montant (FCFA)', '3000');
      await enregistrer(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-ajoutee',
    etapes: async (page) => {
      await choisir(page, 'Catégorie', 'Électricité');
      await remplir(page, 'Libellé', 'Ampoules');
      await remplir(page, 'Montant (FCFA)', '20000');
      await cliquerTexte(page, 'Prendre le justificatif en photo');
      await enregistrer(page);
      await attendreFinDuToast(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-stock-ajoutee',
    etapes: async (page) => {
      await stockLevure(page);
      await enregistrer(page);
      await attendreFinDuToast(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-seuil',
    etapes: async (page) => {
      await remplir(page, 'Libellé', 'Réparation du four');
      await remplir(page, 'Montant (FCFA)', '50000');
      await enregistrer(page);
      await attendreFinDuToast(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-depassement',
    etapes: async (page) => {
      await choisir(page, 'Catégorie', 'Eau');
      await remplir(page, 'Libellé', 'Facture CDE');
      await remplir(page, 'Montant (FCFA)', '40000');
      await enregistrer(page);
      await attendreFinDuToast(page);
    },
  }),
  scenarioDepenses({
    nom: 'depenses-filtre-semaine',
    etapes: (page) => cliquerTexte(page, 'Semaine 41'),
  }),
  scenarioDepenses({
    nom: 'depenses-filtre-stock',
    etapes: async (page) => {
      await cliquerTexte(page, 'Semaine 42');
      await cliquerTexte(page, 'Stock');
    },
  }),
  scenarioDepenses({
    nom: 'depenses-filtre-vide',
    etapes: async (page) => {
      await cliquerTexte(page, 'Semaine 41');
      await cliquerTexte(page, 'Production');
    },
  }),
  scenarioDepenses({
    nom: 'depenses-gerant',
    profil: /Willy/,
    espace: 'gestion',
    etapes: async () => {},
  }),
  scenarioDepenses({
    nom: 'depenses-gerant-seuil',
    profil: /Willy/,
    espace: 'gestion',
    etapes: async (page) => {
      await remplir(page, 'Libellé', 'Moteur du pétrin');
      await remplir(page, 'Montant (FCFA)', '120000');
      await enregistrer(page);
      await attendreFinDuToast(page);
    },
  }),
  // Le propriétaire consulte : le prototype lui montre encore le formulaire (écart assumé, cahier
  // des charges §3.3), seul le budget, au-dessus, est donc comparé.
  scenarioDepenses({
    nom: 'depenses-proprietaire-budget',
    profil: /Fotso/,
    espace: 'gestion',
    zones: { budget: { x: 248, y: 0, width: 1032, height: 420 } },
    etapes: async () => {},
  }),
];
