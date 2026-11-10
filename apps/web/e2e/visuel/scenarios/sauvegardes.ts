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
 * Gestion › Sauvegardes (US-142, US-143), comparée au bloc `scr.backups` du prototype : cartes,
 * bandeau des 48 h, liste des copies (clair et sombre), fenêtre de restauration guidée, copie
 * locale puis copie cloud. Toute la zone de contenu est comparée, en-tête compris ; le menu de
 * gauche ne l'est pas.
 *
 * Écarts assumés (non joués ici) : l'application écrit les dates dans la langue choisie
 * (« Oct 14 18:02 » en anglais) là où le prototype garde le français : l'anglais n'est pas comparé.
 * L'état hors ligne n'est pas comparé non plus (le banc ne coupe pas le réseau) : il est testé par
 * Vitest.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`).
 */

const HAUTEUR = 800;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

/**
 * Bandeau et cartes seulement. Après une sauvegarde, le prototype réécrit la première ligne de la
 * liste (locale) ou la dernière (cloud) au lieu d'ajouter une copie : l'application, elle, ajoute
 * une ligne (les copies sont en ajout seul), la liste n'est donc pas comparée après une sauvegarde.
 */
const CARTES: Zone = { x: 248, y: 0, width: 1032, height: 440 };

const ADMIN = /Support/;

/** Le bouton « Restaurer » de la deuxième copie (14 oct. 13:30), le même des deux côtés. */
const restaurerLaDeuxieme = async (page: Page) => {
  await page
    .locator('button')
    .filter({ hasText: /^\s*Restaurer\s*$/ })
    .nth(1)
    .click();
  await page.waitForTimeout(250);
};

function scenarioSauvegardes(options: {
  nom: string;
  etapes: Etapes;
  theme?: 'clair' | 'sombre';
  /** Zone comparée : tout le contenu, ou seulement le bandeau et les cartes. */
  zone?: Zone;
  /** Le bandeau des 48 h est affiché : seul cas où le bruit de la parenthèse est toléré. */
  bandeau?: boolean;
}): Scenario {
  const { nom, etapes, theme, zone = CONTENU, bandeau = true } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    theme,
    zones: { contenu: zone },
    // Bruit d'anticrénelage connu sur la parenthèse du bandeau des 48 h : 30 à 130 pixels, jamais
    // plus (Chromium arrondit autrement ce glyphe dans les deux pages, texte et position identiques).
    ...(bandeau
      ? {
          seuil: 130,
          justification:
            'Bruit d’anticrénelage connu sur la parenthèse fermante du bandeau des 48 h (30 à 130 px).',
        }
      : {}),
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, ADMIN);
      await cliquerTexte(page, /^\s*Sauvegardes\s*$/);
      await page.getByText('Copies disponibles').first().waitFor();
      await etapes(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, ADMIN);
      await page.waitForURL(/utilisateurs/);
      await page.getByRole('link', { name: 'Sauvegardes', exact: true }).first().click();
      await page.getByText('Copies disponibles').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

export const scenariosSauvegardes: Scenario[] = [
  scenarioSauvegardes({ nom: 'sauvegardes-liste', etapes: async () => {} }),
  scenarioSauvegardes({ nom: 'sauvegardes-liste-sombre', etapes: async () => {}, theme: 'sombre' }),
  scenarioSauvegardes({ nom: 'sauvegardes-restauration', etapes: restaurerLaDeuxieme }),
  scenarioSauvegardes({
    nom: 'sauvegardes-locale',
    etapes: async (page) => {
      await cliquerTexte(page, 'Sauvegarder maintenant');
      await attendreFinDuToast(page);
    },
    zone: CARTES,
  }),
  scenarioSauvegardes({
    nom: 'sauvegardes-cloud',
    etapes: async (page) => {
      await cliquerTexte(page, 'Lancer la sauvegarde cloud');
      await attendreFinDuToast(page);
    },
    zone: CARTES,
    bandeau: false,
  }),
];
