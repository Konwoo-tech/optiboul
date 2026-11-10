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
 * Gestion › Utilisateurs, vue « Utilisateurs » (US-020 à US-022), comparée au bloc `scr.users` du
 * prototype : liste et droits par profil (clair et sombre), filtre par groupe, changement de groupe,
 * désactivation. Toute la zone de contenu est comparée, en-tête compris ; le menu de gauche ne
 * l'est pas. Groupes et Nouvel utilisateur (vide, erreurs, aperçu FR/EN, compte créé, retour à la liste) ont leurs scénarios plus bas.
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

const onglet =
  (nom: string): Etapes =>
  (page) =>
    cliquerTexte(page, nom);

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

const ADMIN = /Support/;

const remplirLeFormulaire: Etapes = async (page) => {
  await cliquerTexte(page, /^\s*\+ Nouvel utilisateur\s*$/);
  await page.getByLabel('Nom complet').fill('Ada Lovelace');
  await page.getByLabel('Adresse Gmail').fill('ada@gmail.com');
  await page.getByLabel(/Téléphone pour la double/).fill('677412018');
  await cliquerTexte(page, /Caisse – équipe de jour/);
  await cliquerTexte(page, 'SMS');
  await page.waitForTimeout(200);
};

const creerLeCompte: Etapes = async (page) => {
  await remplirLeFormulaire(page);
  await cliquerTexte(page, 'Créer l’utilisateur');
  await attendreFinDuToast(page);
};

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
  scenarioUtilisateurs({ nom: 'utilisateurs-groupes', etapes: onglet('Groupes · 6') }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-groupes-en',
    etapes: async (page) => {
      await onglet('Groupes · 6')(page);
      await basculerEn(page);
    },
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-groupe-erreur',
    etapes: async (page) => {
      await onglet('Groupes · 6')(page);
      await cliquerTexte(page, 'Créer le groupe');
    },
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-groupe-cree',
    etapes: async (page) => {
      await onglet('Groupes · 6')(page);
      await page.getByLabel('Nom du groupe').fill('Livreurs');
      await cliquerTexte(page, 'Créer le groupe');
      await attendreFinDuToast(page);
    },
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-nouveau',
    etapes: (page) => cliquerTexte(page, /^\s*\+ Nouvel utilisateur\s*$/),
  }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-nouveau-erreurs',
    etapes: async (page) => {
      await cliquerTexte(page, /^\s*\+ Nouvel utilisateur\s*$/);
      await cliquerTexte(page, 'Créer l’utilisateur');
    },
  }),
  scenarioUtilisateurs({ nom: 'utilisateurs-nouveau-apercu', etapes: remplirLeFormulaire }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-nouveau-apercu-en',
    etapes: async (page) => {
      await remplirLeFormulaire(page);
      await basculerEn(page);
    },
  }),
  scenarioUtilisateurs({ nom: 'utilisateurs-cree', etapes: creerLeCompte }),
  scenarioUtilisateurs({
    nom: 'utilisateurs-cree-liste',
    etapes: async (page) => {
      await creerLeCompte(page);
      await cliquerTexte(page, 'Voir dans la liste');
    },
  }),
];
