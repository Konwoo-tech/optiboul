import type { Page } from '@playwright/test';

import { attendrePolices, cliquer } from '../outils.ts';
import { definirScenario, type Scenario, type Zone } from '../scenario.ts';
import {
  attendreFinDuToast,
  cliquerTexte,
  connecterLApplication,
  connecterLePrototype,
  masquerLeBandeauDeSimulation,
} from './session.ts';

/*
 * Gestion › Semaines (US-169), comparé au bloc `scr.semaines` du prototype : chaque semaine
 * (ouverte, planifiée affectée ou non, clôturée), chaque profil (gérant de la semaine, autre gérant,
 * propriétaire, responsable de production), les fenêtres d'ouverture et de clôture, et la bascule
 * en anglais et en sombre. Toute la zone de contenu est comparée, en-tête compris ; le menu de
 * gauche ne l'est pas (trois espaces au lieu de la barre plate). La fenêtre est haute pour tenir
 * la page entière.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) ; seuls la connexion,
 * l'arrivée sur l'écran et la préparation de la clôture (aide de simulation côté application)
 * diffèrent.
 */

const HAUTEUR = 2900;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;

// Après une préparation par l'aide de simulation, la rangée de pastilles de l'en-tête (session,
// réseau, notifications) n'est pas comparée : elle dépend de l'état des autres écrans, que l'aide
// ne passe pas par l'interface. Le titre et tout le contenu de l'écran le sont.
const TITRE: Zone = { x: 248, y: 0, width: 1032, height: 90 };
const CORPS: Zone = { x: 248, y: 150, width: 1032, height: HAUTEUR - 150 };

const COMPTE = '22450';
const WILLY = /Willy/;
const FOTSO = /Fotso/;
const SERGE = /Serge/;

type Options = {
  nom: string;
  etapes?: Etapes;
  /** Profil qui se connecte (Willy, gérant de la semaine 42, par défaut). */
  profil?: RegExp;
  /** Préparation côté prototype, avant d'ouvrir l'écran (clôtures de session). */
  avantPrototype?: Etapes;
  /** Préparation équivalente côté application, avant de revenir à l'écran. */
  avantApplication?: Etapes;
  theme?: 'clair' | 'sombre';
  seuil?: number;
  justification?: string;
};

/** Les messages brefs durent 3 s : on les laisse partir pour comparer l'écran seul. */
const attendre = attendreFinDuToast;

/** Prototype : l'écran des semaines, par le menu de gauche. */
const ouvrirLePrototype = (page: Page) => cliquerTexte(page, /^\s*Semaines\s*$/);

/** Change de personne : le bouton du bas du menu, puis la personne et son code. */
const changerDePersonne = async (page: Page, profil: RegExp) => {
  await cliquer(page, 'Changer d’utilisateur');
  // Dans le prototype « Qui êtes-vous ? » n'est pas un titre : on laisse l'écran de connexion venir.
  await page.waitForTimeout(800);
  await cliquer(page, profil);
  for (const chiffre of '1234')
    await page.getByRole('button', { name: chiffre, exact: true }).click();
  await page.waitForTimeout(700);
};

function scenarioSemaines(options: Options): Scenario {
  const { nom, profil = WILLY, etapes } = options;
  const chef = profil === SERGE;
  // La préparation (clôtures) se fait toujours en gérant ; on change ensuite de personne.
  const prepare = Boolean(options.avantPrototype);
  const apres = prepare && profil !== WILLY ? profil : null;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    theme: options.theme,
    ...(options.seuil ? { seuil: options.seuil, justification: options.justification } : {}),
    zones: prepare ? { titre: TITRE, corps: CORPS } : { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, prepare ? WILLY : profil);
      await options.avantPrototype?.(page);
      if (apres) await changerDePersonne(page, apres);
      await ouvrirLePrototype(page);
      await page.getByText('Planning des caisses').first().waitFor();
      await etapes?.(page);
      if (options.theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, prepare ? WILLY : profil);
      await page.waitForURL(/\/(comptoir|gestion|atelier)\//);
      await page.goto(`${env.urlApplication}/${chef ? 'atelier' : 'gestion'}/semaines`);
      await page.getByText('Planning des caisses').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      if (options.avantApplication) {
        await options.avantApplication(page);
        if (apres) await changerDePersonne(page, apres);
        // Quitter l'écran puis y revenir relit les semaines.
        else {
          await page.getByRole('link', { name: 'Demandes', exact: true }).first().click();
          await page.getByRole('heading', { name: 'Demandes à traiter' }).waitFor();
          await page.waitForTimeout(500);
        }
        await page.getByRole('link', { name: 'Semaines', exact: true }).first().click();
        await page.getByText('Planning des caisses').first().waitFor();
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(500);
      await attendrePolices(page);
      await etapes?.(page);
      if (options.theme === 'sombre') await cliquerTexte(page, 'Sombre');
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

const semaine =
  (numero: number): Etapes =>
  (page) =>
    cliquerTexte(page, new RegExp(`^\\s*Semaine ${numero}`));

const choisir = async (page: Page, etiquette: RegExp, option: string) => {
  // Le <select> suit son étiquette : dans le prototype un <span> puis le <select>, dans
  // l'application une étiquette liée par aria-labelledby ; on cible le bloc qui porte le texte.
  await page
    .locator('div')
    .filter({ has: page.locator('select') })
    .filter({ hasText: etiquette })
    .last()
    .locator('select')
    .selectOption({ label: option });
  await page.waitForTimeout(250);
};

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

// ---------------------------------------------------------------------------------------------
// Préparation : fermer la caisse et la session, ouvrir et fermer la suivante, pour que la
// production en cours ne bloque plus. Dans le prototype, une seule session ; dans l'application, la
// caisse (Caisses) et la session (Comptoir) sont deux faux serveurs : on ferme les deux, et on
// lève la production en cours par l'aide de simulation.
// ---------------------------------------------------------------------------------------------

const fermerLaSessionDansLePrototype = async (page: Page) => {
  await cliquerTexte(page, /^\s*Session en cours/);
  await page.getByRole('button', { name: 'Clôture', exact: true }).click();
  await page.getByLabel('Espèces comptées').fill(COMPTE);
  await cliquer(page, 'Clôturer la session');
  await cliquer(page, 'Confirmer la clôture');
  await attendre(page);
};

const pretALaClotureDansLePrototype: Etapes = async (page) => {
  await fermerLaSessionDansLePrototype(page);
  await cliquerTexte(page, /^\s*Caisses\s*$/);
  await cliquer(page, /^Ouvrir la caisse · jour 15 oct\.$/);
  await page.getByRole('button', { name: 'Ouvrir la caisse', exact: true }).click();
  await attendre(page);
  await fermerLaSessionDansLePrototype(page);
};

const appel = (page: Page, chemin: string, methode: string, corps: object = {}) =>
  page.evaluate(
    async ([c, m, b]) =>
      (await fetch(c as string, { method: m as string, body: JSON.stringify(b) })).status,
    [chemin, methode, corps] as const,
  );

const pretALaClotureDansLApplication: Etapes = async (page) => {
  const session = '/api/v1/simulation/comptoir/session/';
  const caisses = '/api/v1/simulation/caisses/';
  for (const tour of [1, 2]) {
    await appel(page, `${session}comptage/`, 'PUT', { especes: COMPTE });
    await appel(page, `${session}cloturer/`, 'POST');
    await appel(page, `${caisses}fermer/`, 'POST', { compte: Number(COMPTE) });
    if (tour === 1) {
      await appel(page, `${caisses}ouvrir/`, 'POST', { fonds: 20000 });
      await appel(page, `${session}ouvrir-suivante/`, 'POST');
    }
  }
  await appel(page, '/api/v1/simulation/gestion/semaines/production/cloturer/', 'POST');
};

const pret = {
  avantPrototype: pretALaClotureDansLePrototype,
  avantApplication: pretALaClotureDansLApplication,
};

const cloturerLaSemaine: Etapes = async (page) => {
  await cliquerTexte(page, 'Clôturer la semaine 42');
  await page.waitForTimeout(300);
};

const confirmerLaCloture: Etapes = async (page) => {
  await cloturerLaSemaine(page);
  await cliquerTexte(page, 'Clôturer et générer la passation');
  await attendre(page);
};

const ouvrirLaSemaine43: Etapes = async (page) => {
  await semaine(43)(page);
  await cliquerTexte(page, 'Ouvrir la semaine 43');
  await page.waitForTimeout(300);
};

export const scenariosSemaines: Scenario[] = [
  scenarioSemaines({ nom: 'semaines-ouverte' }),
  scenarioSemaines({
    nom: 'semaines-ouverte-en',
    etapes: basculerEn,
    seuil: 250,
    justification:
      'Incident « Production 13 oct. nuit » : le prototype laisse « nuit » en français en anglais ; l’application écrit « night » (une ligne de 25 px, 210 pixels).',
  }),
  scenarioSemaines({ nom: 'semaines-ouverte-sombre', theme: 'sombre' }),
  scenarioSemaines({
    nom: 'semaines-gerant-planning',
    etapes: async (page) => {
      await choisir(page, /^Session de jour/, 'Davy');
    },
  }),
  scenarioSemaines({ nom: 'semaines-planifiee-lecture', etapes: semaine(43) }),
  scenarioSemaines({ nom: 'semaines-cloturee', etapes: semaine(41) }),
  scenarioSemaines({ nom: 'semaines-production', profil: SERGE }),
  scenarioSemaines({ nom: 'semaines-proprietaire', profil: FOTSO }),
  scenarioSemaines({ nom: 'semaines-proprietaire-planifiee', profil: FOTSO, etapes: semaine(43) }),
  scenarioSemaines({ nom: 'semaines-non-affectee', profil: FOTSO, etapes: semaine(44) }),
  scenarioSemaines({
    nom: 'semaines-affectation',
    profil: FOTSO,
    etapes: async (page) => {
      await semaine(44)(page);
      await choisir(page, /^Gérant de la semaine/, 'Christelle');
      await choisir(page, /^Responsable de production/, 'Ignace');
    },
  }),
  scenarioSemaines({ nom: 'semaines-pret-a-cloturer', ...pret }),
  scenarioSemaines({ nom: 'semaines-modale-cloture', ...pret, etapes: cloturerLaSemaine }),
  scenarioSemaines({ nom: 'semaines-cloturee-par-gerant', ...pret, etapes: confirmerLaCloture }),
  scenarioSemaines({
    nom: 'semaines-modale-ouverture',
    profil: FOTSO,
    ...pret,
    etapes: async (page) => {
      await confirmerLaCloture(page);
      await ouvrirLaSemaine43(page);
    },
  }),
  scenarioSemaines({
    nom: 'semaines-ouverture',
    profil: FOTSO,
    ...pret,
    etapes: async (page) => {
      await confirmerLaCloture(page);
      await ouvrirLaSemaine43(page);
      await cliquerTexte(page, 'Ouvrir la semaine');
      await attendre(page);
    },
  }),
];
