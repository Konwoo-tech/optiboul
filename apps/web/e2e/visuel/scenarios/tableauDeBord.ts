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
 * Gestion › Tableau de bord (US-170, récits US-130 à US-132), comparé au bloc `scr.dashboard` du
 * prototype : indicateurs, recette par nuit, alertes, production par produit, dans toute la zone
 * de contenu (en-tête compris). Le menu de gauche n'est pas comparé (trois espaces au lieu de la
 * barre plate). La fenêtre est haute pour tenir la page entière.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion et
 * l'arrivée sur l'écran diffèrent. Les états viennent des autres écrans (livraison, décision,
 * fermeture de caisse) : le tableau de bord ne se modifie pas lui-même.
 */

const HAUTEUR = 1200;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };
/**
 * `sansBadge` : le badge des notifications (x 280-425, y 100-130) suit l'état de la session dans le
 * prototype et reste statique en simulation, comme dans les scénarios des caisses : il est laissé
 * hors zone. Le reste de l'écran, production comprise, est comparé.
 */
function zones(sansBadge = false): Record<string, Zone> {
  return sansBadge
    ? {
        titre: { x: 248, y: 0, width: 1032, height: 95 },
        pastilles: { x: 428, y: 96, width: 852, height: 48 },
        contenu: { x: 248, y: 145, width: 1032, height: HAUTEUR - 145 },
      }
    : { contenu: CONTENU };
}

type Etapes = (page: Page) => Promise<void>;

type Options = {
  nom: string;
  /** Gestes joués des deux côtés avant d'ouvrir le tableau de bord (autres écrans). */
  avant?: { prototype: Etapes; application: Etapes };
  /** Gestes joués sur le tableau de bord lui-même (langue, thème). */
  etapes?: Etapes;
  /** Profil qui se connecte (Willy, le gérant, par défaut). */
  profil?: RegExp;
  sansBadge?: boolean;
};

const rien: Etapes = async () => {};

/**
 * Textes du prototype que l'application écrit mieux, remplacés dans la page du prototype avant la
 * capture : la mise en page, les polices et les couleurs restent comparées au pixel, seul le texte
 * de ces quelques mots diffère (écarts assumés, listés ici) :
 * - pluriel : « 1 demande(s) en attente », « 2 facture(s) en retard » (et leurs équivalents anglais) ;
 * - unité du manquant fournisseur : « BC-032 · 4 » devient « BC-032 · 4 kg » ;
 * - titre de la carte de production : le prototype y affiche par erreur « Produits et fiches
 *   techniques » (le titre d'un autre écran écrase `T.prodTitle`), l'application garde le titre
 *   voulu, « Production par produit » (cahier des charges §5.11) ;
 * - en anglais, le prototype laisse « Technique » et « nuit » en français dans les alertes ;
 *   l'application dit « Maintenance » et « night ».
 */
const TEXTES_CORRIGES: ReadonlyArray<readonly [string, string]> = [
  ['1 demande(s) en attente', '1 demande en attente'],
  ['2 facture(s) en retard', '2 factures en retard'],
  ['1 pending request(s)', '1 pending request'],
  ['2 overdue invoice(s)', '2 overdue invoices'],
  ['Manquant fournisseur : BC-032 · 4', 'Manquant fournisseur : BC-032 · 4 kg'],
  ['Supplier shortfall: BC-032 · 4', 'Supplier shortfall: BC-032 · 4 kg'],
  ['Technique over budget', 'Maintenance over budget'],
  ['Produits et fiches techniques', 'Production par produit · octobre'],
  ['Products & technical sheets', 'Production by product · October'],
  ['Cash shortfall Oct 12 nuit', 'Cash shortfall Oct 12 night'],
  ['Cash shortfall Oct 14 nuit', 'Cash shortfall Oct 14 night'],
];

const corrigerLesTextesDuPrototype = (page: Page) =>
  page.evaluate((corrections) => {
    const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) {
      const texte = noeud.nodeValue ?? '';
      for (const [avant, apres] of corrections) {
        if (texte.includes(avant)) noeud.nodeValue = texte.replace(avant, apres);
      }
    }
  }, TEXTES_CORRIGES);

const ouvrirDansLePrototype = async (page: Page) => {
  await cliquerTexte(page, /^\s*Tableau de bord\s*$/);
  await page.getByText('Alertes', { exact: true }).waitFor();
};

const ouvrirDansLApplication = async (page: Page) => {
  await page.getByRole('link', { name: 'Gestion', exact: true }).click();
  await page.getByRole('link', { name: 'Tableau de bord', exact: true }).click();
  await page.getByRole('region', { name: 'Alertes' }).waitFor();
};

function scenarioTableauDeBord(options: Options): Scenario {
  const { nom, etapes = rien, profil = /Willy/, avant, sansBadge } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: zones(sansBadge),
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await avant?.prototype(page);
      await ouvrirDansLePrototype(page);
      await etapes(page);
      await corrigerLesTextesDuPrototype(page);
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

// ---------------------------------------------------------------------------
// Gestes sur d'autres écrans
// ---------------------------------------------------------------------------

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Alex (solde nul) prend 50 BAG à 100 FCFA et en paie 4 000 : une dette de 1 000 FCFA. */
const livrerAvecDette = async (page: Page) => {
  await cliquerTexte(page, new RegExp(`^\\s*${echapper('Alex')}`));
  await page.locator('input[placeholder="0"]').nth(0).fill('50');
  await page.locator('input[placeholder="0"]').nth(3).fill('4000');
  await page.waitForTimeout(250);
  await cliquerTexte(page, 'Valider la livraison');
  await attendreFinDuToast(page);
};

const livraisonDansLePrototype: Etapes = async (page) => {
  await cliquerTexte(page, /^\s*Session en cours/);
  await livrerAvecDette(page);
};

const livraisonDansLApplication: Etapes = async (page) => {
  await page.getByRole('link', { name: 'Comptoir', exact: true }).click();
  await page.getByRole('link', { name: 'Session en cours', exact: true }).click();
  await page.getByRole('tab', { name: 'Livraisons' }).waitFor();
  await livrerAvecDette(page);
};

/** 22 450 FCFA comptés pour 22 950 attendus : un manque de 500 FCFA. */
const COMPTE = '22450';

const fermetureDansLePrototype: Etapes = async (page) => {
  await cliquerTexte(page, /^\s*Session en cours/);
  await cliquerTexte(page, 'Clôture');
  await page.getByLabel('Espèces comptées').fill(COMPTE);
  await cliquerTexte(page, 'Clôturer la session');
  await cliquerTexte(page, 'Confirmer la clôture');
  await attendreFinDuToast(page);
};

const fermetureDansLApplication: Etapes = async (page) => {
  await page.getByRole('link', { name: 'Comptoir', exact: true }).click();
  await page.getByRole('link', { name: 'Caisses', exact: true }).click();
  await cliquer(page, 'Fermer la caisse');
  const fenetre = page.getByRole('dialog');
  await fenetre.getByLabel('Espèces comptées').fill(COMPTE);
  await fenetre.getByRole('button', { name: 'Fermer la caisse' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await attendreFinDuToast(page);
};

const accordDuProprietairePrototype: Etapes = async (page) => {
  await cliquerTexte(page, /^\s*Demandes/);
  await cliquer(page, /^Valider$/);
  await page.waitForTimeout(500);
};

const accordDuProprietaireApplication: Etapes = async (page) => {
  await page
    .getByRole('link', { name: /^Demandes/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Décisions récentes' }).waitFor();
  await page.getByRole('button', { name: 'Valider DEM-021' }).click();
  await page.waitForTimeout(500);
};

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

const basculerSombre: Etapes = async (page) => {
  await page.getByRole('button', { name: 'Sombre', exact: true }).click();
  await page.waitForTimeout(300);
};

export const scenariosTableauDeBord: Scenario[] = [
  // Le gérant et le propriétaire voient le même tableau de bord complet (CdC §3.3).
  scenarioTableauDeBord({ nom: 'tableau-de-bord-gerant' }),
  scenarioTableauDeBord({ nom: 'tableau-de-bord-proprietaire', profil: /Fotso/ }),
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-en',
    etapes: basculerEn,
  }),
  scenarioTableauDeBord({ nom: 'tableau-de-bord-sombre', etapes: basculerSombre }),
  // Une livraison à crédit : recette, taux, dettes et dernière barre changent.
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-apres-livraison',
    avant: { prototype: livraisonDansLePrototype, application: livraisonDansLApplication },
  }),
  // Une caisse fermée avec un manque : la nouvelle alerte « À voir » s'ajoute.
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-apres-fermeture',
    sansBadge: true,
    avant: { prototype: fermetureDansLePrototype, application: fermetureDansLApplication },
  }),
  // Le propriétaire valide la dépense du gérant : l'alerte « demande en attente » disparaît.
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-apres-decision',
    profil: /Fotso/,
    avant: {
      prototype: accordDuProprietairePrototype,
      application: accordDuProprietaireApplication,
    },
  }),
];
