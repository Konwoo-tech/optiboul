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
 * Atelier › Stocks (US-169), comparé au bloc `scr.stocks` du prototype : les quatre onglets et
 * leurs états (jour choisi, filtre, erreurs, saisie, comptage, inventaire à valider), dans toute
 * la zone de contenu (en-tête compris). Le menu de gauche n'est pas comparé (trois espaces au
 * lieu de la barre plate). La fenêtre est haute pour tenir la page entière.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion et
 * l'arrivée sur l'écran diffèrent.
 */

const HAUTEUR = 1300;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

const remplir = async (page: Page, libelle: string, valeur: string) => {
  await page.getByLabel(libelle, { exact: true }).fill(valeur);
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

/** Champ « 0 » numéro `rang` du comptage d'inventaire (farine, sel, levure, améliorant, glace, bois, huile). */
const compter = async (page: Page, rang: number, valeur: string) => {
  await page.locator('input[placeholder="0"]').nth(rang).fill(valeur);
  await page.waitForTimeout(100);
};

const ONGLET_ETAT = 'État du stock';
const ONGLET_DATE = 'Stock à date';
const ONGLET_MOUVEMENTS = 'Entrées et sorties';
const ONGLET_INVENTAIRES = 'Inventaires';

type Options = {
  nom: string;
  etapes: Etapes;
  /** Profil qui se connecte (Willy, le gérant, par défaut). */
  profil?: RegExp;
  /** Zones à comparer ; toute la page par défaut. */
  zones?: Record<string, Zone>;
};

function scenarioStocks(options: Options): Scenario {
  const { nom, etapes, profil = /Willy/ } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: options.zones ?? { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await cliquerTexte(page, /^\s*Stocks\s*$/);
      await page.getByRole('button', { name: ONGLET_ETAT, exact: true }).waitFor();
      await etapes(page);
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, profil);
      await page.waitForURL(/\/(comptoir|gestion|atelier)\//);
      await page.goto(`${env.urlApplication}/atelier/stocks`);
      await page.getByRole('tab', { name: ONGLET_ETAT, exact: true }).waitFor();
      await page.getByText('Valeur du stock', { exact: false }).first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes(page);
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

const onglet =
  (nomOnglet: string): Etapes =>
  (page) =>
    cliquerTexte(page, nomOnglet);

const perte: Etapes = async (page) => {
  await onglet(ONGLET_MOUVEMENTS)(page);
  await choisir(page, 'Matière', 'Farine (sacs)');
  await remplir(page, 'Quantité', '25');
  await remplir(page, 'Motif (obligatoire)', 'Sacs mouillés');
  await cliquerTexte(page, 'Enregistrer');
  await attendreFinDuToast(page);
};

const comptageProche: Etapes = async (page) => {
  await onglet(ONGLET_INVENTAIRES)(page);
  await cliquerTexte(page, 'Démarrer un inventaire');
  // Farine 30, sel 14,4, levure 2,7, améliorant 7,2, glace 120, bois 4, huile 20 : tout à ±5 %.
  const valeurs = ['30', '14,4', '2,7', '7,2', '118', '4', '20'];
  for (const [rang, valeur] of valeurs.entries()) await compter(page, rang, valeur);
};

export const scenariosStocks: Scenario[] = [
  scenarioStocks({ nom: 'stocks-etat', etapes: async () => {} }),
  scenarioStocks({ nom: 'stocks-etat-bas', etapes: perte }),
  scenarioStocks({ nom: 'stocks-date', etapes: onglet(ONGLET_DATE) }),
  scenarioStocks({
    nom: 'stocks-date-dimanche',
    etapes: async (page) => {
      await onglet(ONGLET_DATE)(page);
      await cliquerTexte(page, 'dim. 11 oct.');
    },
  }),
  scenarioStocks({
    nom: 'stocks-date-avant-controle',
    etapes: async (page) => {
      await onglet(ONGLET_DATE)(page);
      await cliquerTexte(page, 'lun. 12 oct.');
    },
  }),
  scenarioStocks({
    nom: 'stocks-date-mercredi',
    etapes: async (page) => {
      await onglet(ONGLET_DATE)(page);
      await cliquerTexte(page, 'mer. 7 oct.');
    },
  }),
  scenarioStocks({ nom: 'stocks-mouvements', etapes: onglet(ONGLET_MOUVEMENTS) }),
  scenarioStocks({
    nom: 'stocks-mouvements-entrees',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await cliquerTexte(page, 'Entrées');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvements-vide',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await cliquerTexte(page, 'Pertes');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvement-correction',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await cliquerTexte(page, 'Ajustements');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvement-erreur-quantite',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await cliquerTexte(page, 'Enregistrer');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvement-erreur-motif',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await remplir(page, 'Quantité', '2');
      await cliquerTexte(page, 'Enregistrer');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvement-entree-saisie',
    etapes: async (page) => {
      await onglet(ONGLET_MOUVEMENTS)(page);
      await cliquerTexte(page, 'Entrée (correction)');
      await choisir(page, 'Matière', 'Sel (kg)');
      await remplir(page, 'Quantité', '1,5');
      await remplir(page, 'Motif (obligatoire)', 'Erreur de pesée');
    },
  }),
  scenarioStocks({
    nom: 'stocks-mouvement-perte-ajoutee',
    etapes: async (page) => {
      await perte(page);
    },
  }),
  scenarioStocks({ nom: 'stocks-inventaires', etapes: onglet(ONGLET_INVENTAIRES) }),
  scenarioStocks({
    nom: 'stocks-inventaire-demarre',
    etapes: async (page) => {
      await onglet(ONGLET_INVENTAIRES)(page);
      await cliquerTexte(page, 'Démarrer un inventaire');
    },
  }),
  scenarioStocks({
    nom: 'stocks-inventaire-saisie',
    etapes: async (page) => {
      await onglet(ONGLET_INVENTAIRES)(page);
      await cliquerTexte(page, 'Démarrer un inventaire');
      await compter(page, 0, '28');
      await compter(page, 1, '14,4');
      await compter(page, 2, '2');
    },
  }),
  scenarioStocks({
    nom: 'stocks-inventaire-incomplet',
    etapes: async (page) => {
      await onglet(ONGLET_INVENTAIRES)(page);
      await cliquerTexte(page, 'Démarrer un inventaire');
      await compter(page, 0, '30');
      await cliquerTexte(page, 'Soumettre l’inventaire');
    },
  }),
  scenarioStocks({
    nom: 'stocks-inventaire-valide',
    etapes: async (page) => {
      await comptageProche(page);
      await cliquerTexte(page, 'Soumettre l’inventaire');
      await attendreFinDuToast(page);
    },
  }),
  scenarioStocks({
    nom: 'stocks-inventaire-a-valider',
    etapes: async (page) => {
      await onglet(ONGLET_INVENTAIRES)(page);
      await cliquerTexte(page, 'Démarrer un inventaire');
      const valeurs = ['27', '14,4', '2,7', '7,2', '120', '4', '20'];
      for (const [rang, valeur] of valeurs.entries()) await compter(page, rang, valeur);
      await cliquerTexte(page, 'Soumettre l’inventaire');
      await attendreFinDuToast(page);
    },
  }),
  scenarioStocks({
    nom: 'stocks-chef-etat',
    profil: /Serge/,
    etapes: async () => {},
  }),
  scenarioStocks({
    nom: 'stocks-chef-mouvements',
    profil: /Serge/,
    etapes: onglet(ONGLET_MOUVEMENTS),
  }),
  // Le propriétaire consulte : le prototype lui montre encore la saisie (écart assumé, cahier des
  // charges §3.3), seuls l'état du stock et le stock à date sont donc comparés.
  scenarioStocks({
    nom: 'stocks-proprietaire-etat',
    profil: /Fotso/,
    etapes: async () => {},
  }),
  scenarioStocks({
    nom: 'stocks-proprietaire-date',
    profil: /Fotso/,
    etapes: onglet(ONGLET_DATE),
  }),
];
