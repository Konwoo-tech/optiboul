import type { Page } from '@playwright/test';

import { attendrePolices } from '../outils.ts';
import { definirScenario, type Scenario, type Zone } from '../scenario.ts';
import {
  cliquerTexte,
  connecterLApplication,
  connecterLePrototype,
  masquerLeBandeauDeSimulation,
} from './session.ts';
import {
  basculerEn,
  basculerSombre,
  fermetureDansLApplication,
  fermetureDansLePrototype,
  livraisonDansLApplication,
  livraisonDansLePrototype,
  type Etapes,
} from './tableauDeBord.ts';

/*
 * Gestion › Journal des actions (US-175, récit US-024), comparé au bloc `scr.journal` du
 * prototype : titre de l'écran, carte et lignes (heure, auteur · profil, action). Le menu de
 * gauche n'est pas comparé (trois espaces au lieu de la barre plate) ; le badge des notifications
 * reste hors zone comme dans les scénarios du tableau de bord.
 *
 * Écarts assumés, listés ici :
 * - le bloc des filtres (auteur, type, période) vient d'US-024 et n'existe pas dans la maquette :
 *   il est masqué dans l'application pour la comparaison (`[data-filtres-journal]`), son rendu est
 *   couvert par les tests de l'écran ;
 * - les valeurs avant / après (US-024) n'existent pas dans la maquette : aucune action des
 *   scénarios n'en produit ;
 * - en anglais, la maquette laisse en français le texte des actions et la date « 13 oct. » de la
 *   ligne de la veille (le texte est consigné tel quel) ; l'application écrit « Oct 13 ». La date
 *   est donc réécrite dans le prototype avant la capture.
 */

const HAUTEUR = 800;
const VUE = { width: 1280, height: HAUTEUR };
const ZONES: Record<string, Zone> = {
  titre: { x: 248, y: 0, width: 1032, height: 95 },
  pastilles: { x: 428, y: 96, width: 852, height: 48 },
  contenu: { x: 248, y: 145, width: 1032, height: HAUTEUR - 145 },
};

type Options = {
  nom: string;
  /** Gestes joués des deux côtés avant d'ouvrir le journal (autres écrans). */
  avant?: { prototype: Etapes; application: Etapes };
  /** Gestes joués sur le journal lui-même (langue, thème). */
  etapes?: Etapes;
  /** Profil qui se connecte (Willy, le gérant, par défaut). */
  profil?: RegExp;
  enAnglais?: boolean;
  /** Réécrit le texte de la clôture du prototype (voir `fermetureDuPrototype`). */
  fermeture?: boolean;
};

const rien: Etapes = async () => {};

const ouvrirDansLePrototype = async (page: Page) => {
  await cliquerTexte(page, /^\s*Journal des actions\s*$/);
  await page.getByText('Toutes les actions, avec auteur et heure').waitFor();
  // Le prototype garde le défilement de l'écran précédent (le formulaire de livraison).
  await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0));
};

const ouvrirDansLApplication = async (page: Page) => {
  // L'administrateur n'a que l'espace gestion : pas de lien « Gestion ».
  const espace = page.getByRole('link', { name: 'Gestion', exact: true });
  if ((await espace.count()) > 0) await espace.click();
  await page.getByRole('link', { name: 'Journal des actions', exact: true }).click();
  await page.getByRole('heading', { name: 'Toutes les actions, avec auteur et heure' }).waitFor();
  // Les filtres n'existent pas dans la maquette.
  await page.addStyleTag({ content: '[data-filtres-journal]{display:none!important}' });
};

/**
 * La clôture de la session du prototype devient la fermeture de caisse de l'application : l'écran
 * Caisses consigne « Fermeture de caisse · écart … » (écart assumé, deux écrans différents) ; le « − » typographique de la maquette devient le trait « - » de la trace.
 */
const fermetureDuPrototype = (page: Page) =>
  page.evaluate(() => {
    const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      const texte = noeud.nodeValue ?? '';
      const ecart = /^Clôture de la session de nuit du 14 oct. · (écart .*)$/.exec(texte);
      if (ecart) noeud.nodeValue = `Fermeture de caisse · ${ecart[1]!.replace('−', '-')}`;
    }
  });

/** « 13 oct. » devient « Oct 13 » dans le prototype anglais, comme l'application. */
const dateAnglaisePrototype = (page: Page) =>
  page.evaluate(() => {
    const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      const texte = noeud.nodeValue ?? '';
      if (texte.includes('13 oct.')) noeud.nodeValue = texte.replace('13 oct.', 'Oct 13');
    }
  });

function scenarioJournal(options: Options): Scenario {
  const { nom, etapes = rien, profil = /Willy/, avant, enAnglais, fermeture } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: ZONES,
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await avant?.prototype(page);
      await ouvrirDansLePrototype(page);
      await etapes(page);
      if (enAnglais) await dateAnglaisePrototype(page);
      if (fermeture) await fermetureDuPrototype(page);
      await page.waitForTimeout(300);
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, profil);
      await page.getByRole('navigation').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      await avant?.application(page);
      await ouvrirDansLApplication(page);
      await attendrePolices(page);
      await etapes(page);
      await page.waitForTimeout(500);
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

export const scenariosJournal: Scenario[] = [
  // Le gérant, le propriétaire et l'administrateur voient le même journal (CdC §3.3).
  scenarioJournal({ nom: 'journal-gerant' }),
  scenarioJournal({ nom: 'journal-proprietaire', profil: /Fotso/ }),
  scenarioJournal({ nom: 'journal-administrateur', profil: /Support/ }),
  scenarioJournal({ nom: 'journal-en', etapes: basculerEn, enAnglais: true }),
  scenarioJournal({ nom: 'journal-sombre', etapes: basculerSombre }),
  // Une livraison à crédit : la ligne arrive en tête, avec l'auteur et l'heure.
  scenarioJournal({
    nom: 'journal-apres-livraison',
    avant: { prototype: livraisonDansLePrototype, application: livraisonDansLApplication },
  }),
  // Une caisse fermée avec un manque : la fermeture est consignée.
  scenarioJournal({
    nom: 'journal-apres-fermeture',
    fermeture: true,
    avant: { prototype: fermetureDansLePrototype, application: fermetureDansLApplication },
  }),
];
