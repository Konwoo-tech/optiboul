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
 * Gestion › Personnel et paie (US-174), comparé au bloc `scr.personnel` du prototype : état de
 * paie en brouillon, saisie d'un gain ou d'une pénalité (et son erreur), état soumis (vu par le
 * gérant puis par le propriétaire), validé, paiement partiel puis paiement des restes, et la
 * bascule en anglais et en sombre. Toute la zone de contenu est comparée, en-tête compris ; le
 * menu de gauche ne l'est pas (trois espaces au lieu de la barre plate).
 *
 * Écarts assumés : le prototype ouvre l'écran sur Davy ; l'application, sur le premier employé.
 * Les deux côtés cliquent donc sur la ligne de Davy avant de jouer le scénario. Le propriétaire qui
 * regarde un état validé lit « Le gérant effectue les paiements » là où le prototype dit « Le paiement
 * s'ouvre après validation » (faux pour lui) : pas de scénario sur cet état, la phrase est testée
 * par Vitest.
 *
 * Montants, signes et règles de calcul sont garantis par Vitest (`regles.test.ts`,
 * `simulation/personnel.test.ts`) : le banc ne sert qu'à la mise en page. Les seuils (600 px, au plus
 * 800 px) ne couvrent que le bruit des glyphes « − » et des parenthèses : ne pas les relever, un
 * écart de plus est un défaut de l'écran.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) ; seuls la connexion,
 * l'arrivée sur l'écran et le changement de personne diffèrent.
 */

const HAUTEUR = 1900;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;
type Acte = { profil: RegExp; etapes?: Etapes };

const WILLY = /Willy/;
const FOTSO = /Fotso/;

/** Change de personne : le bouton du bas du menu, puis la personne et son code. */
const changerDePersonne = async (page: Page, profil: RegExp, application: boolean) => {
  await cliquer(page, 'Changer d’utilisateur');
  await page.waitForTimeout(800);
  if (application) {
    // L'application rouvre la connexion par e-mail : profil de démonstration, e-mail, code SMS.
    await cliquer(page, profil);
    await cliquer(page, 'Se connecter');
    await cliquer(page, /Envoyer le code par SMS/);
    await page.getByLabel('Code à 6 chiffres').fill('123456');
    await page.waitForTimeout(1200);
    // Le message « code envoyé » n'existe pas dans le prototype : on le laisse partir.
    await attendreFinDuToast(page);
    return;
  }
  await cliquer(page, profil);
  for (const chiffre of '1234') await cliquer(page, chiffre);
  await page.waitForTimeout(700);
};

const ligneDe = (page: Page, prenom: string) => cliquerTexte(page, new RegExp(`^\\s*${prenom}`));

type Options = {
  nom: string;
  /** Qui agit, dans l'ordre ; le dernier acte est celui qu'on photographie. */
  actes: Acte[];
  theme?: 'clair' | 'sombre';
  /** Pixels tolérés au-delà du bruit habituel des glyphes (voir `BRUIT`). */
  seuil?: number;
};

const BRUIT =
  'Bruit de rendu connu des glyphes « − » et des parenthèses (une centaine de pixels par occurrence, présent aussi sur des écrans non touchés) : l’écran en compte une trentaine (retenues, avances, pénalités, formule du net). Aucune différence de mise en page ni de texte : les images de différence ne montrent que ces glyphes.';

function scenarioPersonnel({ nom, actes, theme, seuil = 600 }: Options): Scenario {
  const premier = actes[0]!.profil;
  return definirScenario({
    nom,
    variante: 'code',
    viewport: VUE,
    theme,
    seuil,
    justification: BRUIT,
    zones: { contenu: CONTENU },
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, premier);
      for (const [rang, acte] of actes.entries()) {
        if (rang > 0) await changerDePersonne(page, acte.profil, false);
        await cliquerTexte(page, /^\s*Personnel et paie\s*$/);
        await page.getByText('Calendrier des paies').first().waitFor();
        await acte.etapes?.(page);
      }
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, premier);
      await page.waitForURL(/\/(comptoir|gestion|atelier)\//);
      await page.goto(`${env.urlApplication}/gestion/personnel`);
      await page.getByText('Calendrier des paies').first().waitFor();
      await masquerLeBandeauDeSimulation(page);
      for (const [rang, acte] of actes.entries()) {
        if (rang > 0) {
          await changerDePersonne(page, acte.profil, true);
          await masquerLeBandeauDeSimulation(page);
          await page.getByRole('link', { name: 'Personnel et paie', exact: true }).first().click();
          await page.getByText('Calendrier des paies').first().waitFor();
        }
        await page.waitForTimeout(500);
        await attendrePolices(page);
        // Le prototype ouvre l'écran sur Davy.
        await ligneDe(page, 'Davy');
        await acte.etapes?.(page);
      }
      if (theme === 'sombre') await cliquerTexte(page, 'Sombre');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

const basculerEn: Etapes = async (page) => {
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(300);
};

const ajouter =
  (type: 'Gain / prime' | 'Pénalité', description: string, montant: string): Etapes =>
  async (page) => {
    await cliquerTexte(page, type);
    await page.getByLabel('Description').fill(description);
    await page.getByLabel('Montant (FCFA)').fill(montant);
    await cliquerTexte(page, 'Ajouter la ligne');
    await page.waitForTimeout(300);
  };

const soumettre: Etapes = async (page) => {
  await cliquerTexte(page, 'Soumettre au propriétaire');
  await attendreFinDuToast(page);
};

const valider: Etapes = async (page) => {
  await cliquerTexte(page, 'Valider l’état de paie');
  await attendreFinDuToast(page);
};

const payerDavy =
  (montant: string): Etapes =>
  async (page) => {
    await page.locator('input[placeholder]').first().fill(montant);
    await cliquerTexte(page, 'Payer Davy');
    await attendreFinDuToast(page);
  };

const brouillon: Acte = { profil: WILLY };
const soumis: Acte = { profil: WILLY, etapes: soumettre };
const chezLeProprietaire: Acte = { profil: FOTSO };
const valide: Acte[] = [soumis, { profil: FOTSO, etapes: valider }, { profil: WILLY }];

export const scenariosPersonnel: Scenario[] = [
  scenarioPersonnel({ nom: 'personnel-brouillon', actes: [brouillon] }),
  scenarioPersonnel({
    nom: 'personnel-brouillon-en',
    actes: [{ profil: WILLY, etapes: basculerEn }],
    seuil: 700,
  }),
  scenarioPersonnel({
    nom: 'personnel-brouillon-sombre',
    actes: [brouillon],
    theme: 'sombre',
    seuil: 800,
  }),
  scenarioPersonnel({
    nom: 'personnel-erreur-saisie',
    actes: [
      {
        profil: WILLY,
        etapes: async (page) => {
          await cliquerTexte(page, 'Ajouter la ligne');
        },
      },
    ],
  }),
  scenarioPersonnel({
    nom: 'personnel-ajout-penalite',
    actes: [{ profil: WILLY, etapes: ajouter('Pénalité', 'Retard à la prise de poste', '1500') }],
  }),
  scenarioPersonnel({
    nom: 'personnel-ajout-gain',
    actes: [{ profil: WILLY, etapes: ajouter('Gain / prime', 'Prime de présence', '4000') }],
  }),
  scenarioPersonnel({ nom: 'personnel-soumis', actes: [soumis] }),
  scenarioPersonnel({ nom: 'personnel-soumis-proprietaire', actes: [soumis, chezLeProprietaire] }),
  scenarioPersonnel({ nom: 'personnel-brouillon-proprietaire', actes: [chezLeProprietaire] }),
  scenarioPersonnel({ nom: 'personnel-valide', actes: valide }),
  scenarioPersonnel({
    nom: 'personnel-paiement-partiel',
    actes: [...valide.slice(0, 2), { profil: WILLY, etapes: payerDavy('30000') }],
  }),
  scenarioPersonnel({
    nom: 'personnel-paiement-solde',
    actes: [...valide.slice(0, 2), { profil: WILLY, etapes: payerDavy('') }],
  }),
  scenarioPersonnel({
    nom: 'personnel-tout-paye',
    actes: [
      ...valide.slice(0, 2),
      {
        profil: WILLY,
        etapes: async (page) => {
          await cliquerTexte(page, /^\s*Payer tous les restes/);
          await attendreFinDuToast(page);
        },
      },
    ],
  }),
];
