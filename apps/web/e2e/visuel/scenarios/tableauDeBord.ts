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

const HAUTEUR = 1100;
const VUE = { width: 1280, height: HAUTEUR };
// Le titre de la carte « Production par produit » est hors zone : le prototype y affiche par erreur
// « Produits et fiches techniques » (le titre d'un autre écran, `T.prodTitle` écrasé), alors que
// sa fonction `vDashboard` et le cahier des charges §5.11 disent « Production par produit ». Écart
// assumé : l'application garde le titre voulu. Tout le reste de la carte est comparé.
/**
 * `decalage` : hauteur gagnée (ou perdue, négative) par la rangée des alertes quand une alerte
 * s'ajoute ou disparaît ; il descend la carte « Production » d'autant. `sansBadge` : le badge des
 * notifications (x 280-425, y 100-130) suit l'état de la session dans le prototype et reste
 * statique en simulation, comme dans les scénarios des caisses : il est laissé hors zone.
 */
function zones(decalage = 0, sansBadge = false): Record<string, Zone> {
  const haut = 794 + decalage;
  const bas = 822 + decalage;
  const production = { x: 248, y: bas, width: 1032, height: HAUTEUR - bas };
  return sansBadge
    ? {
        titre: { x: 248, y: 0, width: 1032, height: 95 },
        pastilles: { x: 428, y: 96, width: 852, height: 48 },
        contenu: { x: 248, y: 145, width: 1032, height: haut - 145 },
        production,
      }
    : { haut: { x: 248, y: 0, width: 1032, height: haut }, production };
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
  decalage?: number;
  sansBadge?: boolean;
  seuil?: number;
  justification?: string;
};

const rien: Etapes = async () => {};

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
  const { nom, etapes = rien, profil = /Willy/, avant, decalage, sansBadge } = options;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    zones: zones(decalage, sansBadge),
    ...(options.seuil ? { seuil: options.seuil, justification: options.justification } : {}),
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      await avant?.prototype(page);
      await ouvrirDansLePrototype(page);
      await etapes(page);
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
  // Deux libellés du prototype restent en français en anglais (« Technique over budget », « Oct 12
  // nuit ») : l'application les traduit (« Maintenance », « night »). Écart assumé, borné à ces
  // deux lignes d'alertes (1 890 px).
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-en',
    etapes: basculerEn,
    seuil: 1900,
    justification:
      'Le prototype laisse « Technique » et « nuit » en français dans les alertes anglaises ; l’application les traduit.',
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
    decalage: 63,
    sansBadge: true,
    avant: { prototype: fermetureDansLePrototype, application: fermetureDansLApplication },
  }),
  // Le propriétaire valide la dépense du gérant : l'alerte « demande en attente » disparaît.
  scenarioTableauDeBord({
    nom: 'tableau-de-bord-apres-decision',
    decalage: -47,
    profil: /Fotso/,
    avant: {
      prototype: accordDuProprietairePrototype,
      application: accordDuProprietaireApplication,
    },
  }),
];
