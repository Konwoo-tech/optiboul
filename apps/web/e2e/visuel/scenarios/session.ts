import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Environnement, type Scenario, type Zone } from '../scenario.ts';

/*
 * Comptoir › Session en cours (US-165) : chaque onglet et chaque état important, comparés au
 * prototype dans toute la zone de contenu (en-tête compris). Le menu de gauche n'est pas
 * comparé : trois espaces au lieu de la barre plate, écart assumé.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion
 * et l'arrivée sur l'écran diffèrent.
 */

const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: 800 };

type Etapes = (page: Page) => Promise<void>;

// Le bandeau « simulation » n'existe pas dans le prototype.
export const masquerLeBandeauDeSimulation = (page: Page) =>
  page.addStyleTag({ content: '[data-simulation]{display:none!important}' });

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bouton (ou onglet) dont le texte visible est exactement celui-ci, ou correspond au motif. */
const bouton = (page: Page, texte: string | RegExp) =>
  page.locator('button, [role="tab"]').filter({
    hasText: typeof texte === 'string' ? new RegExp(`^\\s*${echapper(texte)}\\s*$`) : texte,
  });

export const cliquerTexte = async (page: Page, texte: string | RegExp) => {
  await bouton(page, texte).first().click();
  await page.waitForTimeout(250);
};

const onglet = (page: Page, nom: string) => cliquerTexte(page, nom);

const client = (page: Page, nom: string) => cliquerTexte(page, new RegExp(`^\\s*${echapper(nom)}`));

/** Champ « 0 » numéro `rang` de la page : BAG, KO, GC puis « reçu » dans une livraison. */
const saisirChamp = async (page: Page, rang: number, valeur: string) => {
  await page.locator('input[placeholder="0"]').nth(rang).fill(valeur);
  await page.waitForTimeout(150);
};

const defiler = async (page: Page) => {
  await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 99_999));
  await page.waitForTimeout(150);
};

/** Les toasts durent 3 s : on attend qu'ils disparaissent pour ne comparer que l'écran. */
export const attendreFinDuToast = (page: Page) => page.waitForTimeout(3400);

export const connecterLePrototype = async (page: Page, adresse: string, profil: RegExp) => {
  await page.goto(adresse);
  await attendrePolices(page);
  await cliquer(page, profil);
  for (const chiffre of '1234') await cliquer(page, chiffre);
  await page.waitForTimeout(700);
};

export const connecterLApplication = async (page: Page, adresse: string, profil: RegExp) => {
  await page.goto(`${adresse}/connexion?mode=code&deuxFacteurs=0`);
  await page.getByRole('heading', { name: 'Qui êtes-vous ?' }).waitFor();
  await cliquer(page, 'Clair');
  await cliquer(page, profil);
  for (const chiffre of '1234') await cliquer(page, chiffre);
};

type Options = {
  nom: string;
  etapes: Etapes;
  /** Profil qui se connecte (Davy, le caissier, par défaut). */
  profil?: RegExp;
  /** Écran d'arrivée : le prototype y va par le menu, l'application par l'adresse. */
  menu?: boolean;
  /** Pixels tolérés ; la justification est alors obligatoire. */
  seuil?: number;
  justification?: string;
};

function scenarioSession(options: Options): Scenario {
  const { nom, etapes, profil = /Davy/, menu = false } = options;
  return definirScenario({
    nom,
    variante: 'code',
    zones: { contenu: CONTENU },
    ...(options.seuil ? { seuil: options.seuil, justification: options.justification } : {}),
    prototype: async (page: Page, env: Environnement) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      if (menu) await cliquerTexte(page, /^\s*Session en cours/);
      await etapes(page);
    },
    application: async (page: Page, env: Environnement) => {
      await connecterLApplication(page, env.urlApplication, profil);
      if (menu) {
        // Le gérant et le propriétaire arrivent dans la gestion : on attend la fin de la connexion.
        await page.waitForURL(/\/gestion\//);
      }
      if (menu) await page.goto(`${env.urlApplication}/comptoir/session`);
      await page.getByRole('tab', { name: 'Livraisons' }).waitFor();
      await masquerLeBandeauDeSimulation(page);
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes(page);
    },
  });
}

// ---------------------------------------------------------------------------
// Étapes réutilisées
// ---------------------------------------------------------------------------

/** Mama Ngono (tarif A, solde nul) : 100 BAG = 10 000 FCFA. */
const livraisonMobile: Etapes = async (page) => {
  await client(page, 'Mama Ngono');
  await saisirChamp(page, 0, '100');
  await cliquerTexte(page, 'MTN MoMo');
};

/** Brice doit déjà 4 200 FCFA : 30 BAG payés 1 000 FCFA dépassent le plafond. */
const plafondDepasse: Etapes = async (page) => {
  await client(page, 'Brice');
  await saisirChamp(page, 0, '30');
  await saisirChamp(page, 3, '1000');
};

const demandeAutorisation: Etapes = async (page) => {
  await plafondDepasse(page);
  await cliquerTexte(page, 'Demander l’autorisation du gérant');
};

/** Alex (solde nul) prend 50 BAG à 100 FCFA et en paie 4 000 : une dette de 1 000 FCFA. */
const livraisonAvecDette: Etapes = async (page) => {
  await client(page, 'Alex');
  await saisirChamp(page, 0, '50');
  await saisirChamp(page, 3, '4000');
};

const cloture: Etapes = (page) => onglet(page, 'Clôture');

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

export const scenariosSession: Scenario[] = [
  scenarioSession({ nom: 'session-livraisons', etapes: async () => {} }),
  scenarioSession({ nom: 'session-commandes', etapes: (page) => onglet(page, 'Commandes') }),
  scenarioSession({
    nom: 'session-commandes-bas',
    etapes: async (page) => {
      await onglet(page, 'Commandes');
      await defiler(page);
    },
  }),
  scenarioSession({
    nom: 'session-commandes-relance',
    etapes: async (page) => {
      await onglet(page, 'Commandes');
      await cliquerTexte(page, 'Relancer');
    },
  }),
  scenarioSession({
    nom: 'session-livraison-en-cours',
    etapes: async (page) => {
      await client(page, 'Hervé');
      await saisirChamp(page, 0, '60');
      await saisirChamp(page, 2, '30');
      await cliquerTexte(page, 'Exact');
    },
  }),
  scenarioSession({ nom: 'session-livraison-dette', etapes: livraisonAvecDette }),
  scenarioSession({ nom: 'session-livraison-mobile', etapes: livraisonMobile }),
  scenarioSession({ nom: 'session-plafond-depasse', etapes: plafondDepasse }),
  scenarioSession({ nom: 'session-plafond-demande', etapes: demandeAutorisation }),
  scenarioSession({
    nom: 'session-plafond-autorise',
    etapes: async (page) => {
      await demandeAutorisation(page);
      await page.locator('input[type="password"]').fill('1234');
      await cliquerTexte(page, 'Autoriser la livraison');
      await page.waitForTimeout(250);
    },
  }),
  scenarioSession({
    nom: 'session-livraison-validee',
    etapes: async (page) => {
      await livraisonAvecDette(page);
      await cliquerTexte(page, 'Valider la livraison');
      await page.waitForTimeout(250);
    },
  }),
  scenarioSession({
    nom: 'session-bon',
    etapes: async (page) => {
      await cliquerTexte(page, 'Bon');
    },
  }),
  scenarioSession({
    nom: 'session-bon-dette',
    etapes: async (page) => {
      await livraisonAvecDette(page);
      await cliquerTexte(page, 'Valider la livraison');
      await cliquerTexte(page, 'Bon de livraison');
    },
  }),
  scenarioSession({
    nom: 'session-mouvements',
    etapes: (page) => onglet(page, 'Mouvements internes'),
  }),
  scenarioSession({
    nom: 'session-mouvements-erreur',
    etapes: async (page) => {
      await onglet(page, 'Mouvements internes');
      await saisirChamp(page, 0, '5');
      await cliquerTexte(page, 'Ajouter le mouvement');
    },
  }),
  scenarioSession({
    nom: 'session-mouvements-ajoute',
    etapes: async (page) => {
      await onglet(page, 'Mouvements internes');
      await cliquerTexte(page, 'Retours');
      await cliquerTexte(page, 'KO');
      await saisirChamp(page, 0, '8');
      await page.locator('label input:not([placeholder])').first().fill('Retour du client');
      await cliquerTexte(page, 'Ajouter le mouvement');
    },
  }),
  scenarioSession({ nom: 'session-cloture', etapes: cloture }),
  scenarioSession({
    nom: 'session-cloture-manque',
    etapes: async (page) => {
      await cloture(page);
      await saisirChamp(page, 0, '22500');
    },
  }),
  scenarioSession({
    nom: 'session-cloture-confirmation',
    etapes: async (page) => {
      await cloture(page);
      await saisirChamp(page, 0, '22950');
      await cliquerTexte(page, 'Clôturer la session');
    },
  }),
  scenarioSession({
    nom: 'session-cloturee',
    etapes: async (page) => {
      await cloture(page);
      await saisirChamp(page, 0, '22950');
      await cliquerTexte(page, 'Clôturer la session');
      await cliquerTexte(page, 'Confirmer la clôture');
      await attendreFinDuToast(page);
    },
  }),
  scenarioSession({
    nom: 'session-cloturee-livraisons',
    seuil: 6,
    justification:
      'Six pixels (écart max 39/255), lignes 112 et 129-130, colonnes 146-149 et 159 de la zone : le haut et le bas du rond rouge du compteur de notifications (mêmes position et taille que le prototype), composant partagé de l’en-tête : anticrénelage de la forme, déterministe, sans effet sur le texte ni la mise en page. Le même compteur est identique à l’octet près dans les 23 autres scénarios.',
    etapes: async (page) => {
      await cloture(page);
      await saisirChamp(page, 0, '22950');
      await cliquerTexte(page, 'Clôturer la session');
      await cliquerTexte(page, 'Confirmer la clôture');
      await onglet(page, 'Livraisons');
      await attendreFinDuToast(page);
    },
  }),
  scenarioSession({
    nom: 'session-gerant-commandes',
    profil: /Willy/,
    menu: true,
    etapes: (page) => onglet(page, 'Commandes'),
  }),
  scenarioSession({
    nom: 'session-proprietaire-livraisons',
    profil: /Fotso/,
    menu: true,
    etapes: async () => {},
  }),
];
