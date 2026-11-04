import type { Page } from '@playwright/test';

import { attendrePolices } from '../outils.ts';
import { definirScenario, type Scenario, type Zone } from '../scenario.ts';
import {
  cliquerTexte,
  connecterLApplication,
  connecterLePrototype,
  masquerLeBandeauDeSimulation,
} from './session.ts';

/*
 * Gestion › Utilisateurs, vue « Utilisateurs » (US-020 à US-022), comparée au bloc `scr.users` du
 * prototype : liste et droits par profil (clair et sombre), filtre par groupe, changement de groupe,
 * désactivation. Toute la zone de contenu est comparée, en-tête compris ; le menu de gauche ne
 * l'est pas. Les onglets Groupes et Nouvel utilisateur ont leurs scénarios dans la PR suivante.
 *
 * Écarts assumés (non joués ici) : l'application écrit le dernier accès en anglais (« Oct 14 »)
 * là où le prototype garde le français : la liste n'est donc pas comparée en anglais. L'aperçu des
 * accès d'un groupe de gérants n'est pas comparé : le prototype y ajoute « Paramètres », que
 * `navigation.ts` (cahier des charges §3.3) retire au gérant ; la différence est testée par Vitest.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`).
 */

const HAUTEUR = 1500;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

const ADMIN = /Support/;

function scenarioUtilisateurs(options: {
  nom: string;
  etapes: Etapes;
  theme?: 'clair' | 'sombre';
  seuil?: number;
  justification?: string;
}): Scenario {
  const { nom, etapes, theme, seuil, justification } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    theme,
    ...(seuil ? { seuil, justification } : {}),
    zones: { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, ADMIN);
      await cliquerTexte(page, /^\s*Utilisateurs et rôles\s*$/);
      await page.getByText('Droits par profil').first().waitFor();
      await etapes(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, ADMIN);
      // Pas de rechargement : la simulation vit en mémoire et un rechargement effacerait le
      // dernier accès noté à la connexion. L’administrateur arrive sur cet écran.
      await page.waitForURL(/utilisateurs/);
      await page.getByText('Droits par profil').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes(page);
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

export const scenariosUtilisateurs: Scenario[] = [
  scenarioUtilisateurs({ nom: 'utilisateurs-liste', etapes: async () => {} }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-liste-sombre',
    etapes: async () => {},
    theme: 'sombre',
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-filtre',
    etapes: (page) => cliquerTexte(page, /^\s*Production · 2\s*$/),
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-changement-groupe',
    etapes: async (page) => {
      const ligne = page.locator('select').first();
      await ligne.selectOption({ label: 'Caisse – équipe de jour' });
      await page.waitForTimeout(300);
    },
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-desactive',
    etapes: async (page) => {
      await cliquerTexte(page, 'Désactiver');
      await page.waitForTimeout(300);
    },
  }),
];
