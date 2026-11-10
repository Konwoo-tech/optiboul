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
 * Gestion › Paramètres (US-178, récit US-023), comparé au bloc `scr.parametres` du prototype :
 * « Seuils et règles » et « Produits et fiches techniques », dans toute la zone de contenu
 * (en-tête compris). Le menu de gauche n'est pas comparé (trois espaces au lieu de la barre plate).
 *
 * Écarts assumés :
 * - les blocs ajoutés sous la maquette (tous les autres paramètres, historique des valeurs, note de
 *   lecture seule) portent `data-hors-maquette` et sont masqués côté application ;
 * - le prototype enregistre à chaque frappe, l'application en quittant le champ : les deux côtés
 *   jouent la même saisie suivie d'une sortie du champ ; l'application confirme par un message qu'on
 *   laisse disparaître avant de comparer ;
 * - l'administrateur n'est pas joué : le prototype lui donne un écran identique à celui du
 *   propriétaire avec des fiches ouvrables, l'application le met en lecture seule (cahier des
 *   charges §3.3), testé par Vitest.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`).
 */

const VUE = { width: 1280, height: 800 };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: 800 };

type Etapes = (page: Page) => Promise<void>;

const PROPRIETAIRE = /Fotso/;

/**
 * Bruit de police : le prototype charge la Manrope statique de Google Fonts, l'application la
 * Manrope variable. Dans les colonnes de chiffres à chasse fixe, le dernier « 6 » de « 426 » et de
 * « 216 » (quatre lignes) et le « 1 » de « 160 / 165 » tombent à un tiers de pixel d'écart (5 zones
 * de 8 x 10 px au plus, 225 à 235 pixels, mesurées image par image). Rien d'autre ne diffère.
 */
const SEUIL = 240;
const JUSTIFICATION =
  'Bruit de police (Manrope statique du prototype contre Manrope variable) : 5 chiffres (quatre 6 et un 1), décalés d’un tiers de pixel dans les colonnes de chiffres.';

function scenarioParametres(options: {
  nom: string;
  etapes?: Etapes;
  theme?: 'clair' | 'sombre';
}): Scenario {
  const { nom, etapes, theme } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    theme,
    seuil: SEUIL,
    justification: JUSTIFICATION,
    zones: { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, PROPRIETAIRE);
      await cliquerTexte(page, /^\s*Paramètres\s*$/);
      await page.getByText('Seuils et règles').first().waitFor();
      await etapes?.(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, PROPRIETAIRE);
      await page.waitForURL(/\/(comptoir|gestion|atelier)\//);
      await page.goto(`${env.urlApplication}/gestion/parametres`);
      await page.getByText('Seuils et règles').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.addStyleTag({ content: '[data-hors-maquette]{display:none!important}' });
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes?.(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

/** Change le plafond de dette (premier champ) puis quitte le champ, comme la maquette l'enregistre. */
const changerLePlafond: Etapes = async (page) => {
  const champ = page.locator('input[inputmode="numeric"]').first();
  await champ.fill('3500');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await attendreFinDuToast(page);
};

export const scenariosParametres: Scenario[] = [
  scenarioParametres({ nom: 'parametres-proprietaire' }),
  scenarioParametres({ nom: 'parametres-proprietaire-sombre', theme: 'sombre' }),
  scenarioParametres({ nom: 'parametres-proprietaire-en', etapes: basculerEn }),
  scenarioParametres({ nom: 'parametres-seuil-modifie', etapes: changerLePlafond }),
];
