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
 * Atelier › Production (US-169), comparé au bloc `scr.production` et à l'écran `scr.produit` du
 * prototype : le cycle, le reste à produire, les trois onglets, l'historique, la fenêtre de clôture
 * et la fiche technique. Toute la zone de contenu est comparée, en-tête compris ; le menu de
 * gauche ne l'est pas (trois espaces au lieu de la barre plate). La fenêtre est haute pour tenir
 * la page entière.
 *
 * Les deux côtés jouent les mêmes gestes, écrits une seule fois (`etapes`) : seuls la connexion,
 * l'arrivée sur l'écran et la position du cycle diffèrent. Le prototype n'a qu'une session, en
 * production : pour montrer les autres étapes, on réécrit son état (`setState` du composant) ; côté
 * application, la route de démonstration place le cycle au même endroit.
 */

const HAUTEUR = 2700;
const VUE = { width: 1280, height: HAUTEUR };
const CONTENU: Zone = { x: 248, y: 0, width: 1032, height: HAUTEUR };

type Etapes = (page: Page) => Promise<void>;
type Etape = 'commandes' | 'plan-propose' | 'plan-valide' | 'en-cours' | 'cloturee';
type Onglet = 'Plan' | 'Réalisé' | 'Consommation';

/** État du cycle dans le prototype (`session.prod`) pour chaque étape. */
const JALONS_VIDES = {
  plannedBy: '',
  plannedAt: '',
  validatedBy: '',
  validatedAt: '',
  openedBy: '',
  openedAt: '',
};
const ETATS_PROTOTYPE: Record<Exclude<Etape, 'cloturee'>, Record<string, string>> = {
  commandes: { ...JALONS_VIDES, status: 'commandes' },
  'plan-propose': {
    ...JALONS_VIDES,
    status: 'plan_propose',
    plannedBy: 'Serge',
    plannedAt: '17:20',
  },
  'plan-valide': {
    ...JALONS_VIDES,
    status: 'plan_valide',
    plannedBy: 'Serge',
    plannedAt: '17:20',
    validatedBy: 'Willy',
    validatedAt: '17:42',
  },
  'en-cours': {
    status: 'en_cours',
    plannedBy: 'Serge',
    plannedAt: '17:20',
    validatedBy: 'Willy',
    validatedAt: '17:42',
    openedBy: 'Serge',
    openedAt: '19:05',
  },
};

/** Réécrit l'état du prototype : le composant n'est pas exposé, on le retrouve par React. */
async function ecrireEtatDuPrototype(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((patch) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fibre: any = null;
    for (const element of document.querySelectorAll('*')) {
      const cle = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fibre = cle ? (element as any)[cle] : null;
      while (fibre && !(fibre.stateNode?.logic?.setState && fibre.stateNode.logic.state?.session)) {
        fibre = fibre.return;
      }
      if (fibre) break;
    }
    if (!fibre) throw new Error('Composant du prototype introuvable');
    const composant = fibre.stateNode.logic;
    composant.setState((s: Record<string, any>) => ({
      session: {
        ...s.session,
        ...(patch.session as object),
        prod: { ...s.session.prod, ...(patch.prod as object) },
      },
      ...(patch.autres as object),
    }));
  }, patch);
  await page.waitForTimeout(250);
}

async function allerA(page: Page, chemin: string) {
  await page.evaluate((chemin) => {
    history.pushState(null, '', chemin);
    dispatchEvent(new PopStateEvent('popstate'));
  }, chemin);
}

type Options = {
  nom: string;
  etapes?: Etapes;
  /** Qui regarde l'écran (Serge, le chef de production, par défaut). */
  profil?: RegExp;
  etape?: Etape;
  onglet?: Onglet;
  zones?: Record<string, Zone>;
  /** Hauteur de la fenêtre, 2 700 px par défaut. */
  hauteur?: number;
  seuil?: number;
  justification?: string;
};

function scenarioProduction(options: Options): Scenario {
  const { nom, etapes, profil = /Serge/, etape = 'en-cours', onglet } = options;
  const vue = options.hauteur ? { width: 1280, height: options.hauteur } : VUE;
  const zones = options.zones ?? {
    contenu: { ...CONTENU, height: vue.height },
  };
  return definirScenario({
    nom,
    variante: 'code',
    viewport: vue,
    zones,
    ...(options.seuil ? { seuil: options.seuil, justification: options.justification } : {}),
    prototype: async (page, env) => {
      await connecterLePrototype(page, env.urlPrototype, profil);
      // Le chef arrive sur Production ; les autres profils l'ouvrent par le menu.
      await cliquerTexte(page, /^\s*Production\s*$/);
      if (etape !== 'en-cours' && etape !== 'cloturee') {
        await ecrireEtatDuPrototype(page, { prod: ETATS_PROTOTYPE[etape] });
      }
      if (onglet) await cliquerTexte(page, onglet);
      await etapes?.(page);
    },
    application: async (page, env) => {
      await connecterLApplication(page, env.urlApplication, profil);
      await page.waitForURL(/\/(atelier|comptoir|gestion)\//);
      await masquerLeBandeauDeSimulation(page);
      if (etape !== 'en-cours' && etape !== 'cloturee') {
        await page.evaluate(
          (etape) =>
            fetch('/api/v1/simulation/atelier/production/demo/etape/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ etape }),
            }),
          etape,
        );
      }
      await allerA(page, '/atelier/production');
      await page.getByRole('heading', { name: 'Productions rattachées aux semaines' }).waitFor();
      await page.waitForTimeout(500);
      await attendrePolices(page);
      if (onglet) await cliquerTexte(page, onglet);
      await etapes?.(page);
      // Le focus du clavier n'existe pas dans le prototype.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  });
}

// ---------------------------------------------------------------------------
// Gestes réutilisés
// ---------------------------------------------------------------------------

const remplir = async (page: Page, champ: ReturnType<Page['locator']>, valeur: string) => {
  await champ.fill(valeur);
  await page.waitForTimeout(150);
};

/** Champs « Réalisé » (BAG, KO, GC) puis, dans l'autre onglet, les sept champs « 0 » de consommation. */
const realise = (page: Page, rang: number) => page.getByPlaceholder('Réalisé').nth(rang);
const conso = (page: Page, rang: number) => page.locator('input[placeholder="0"]').nth(rang);

/** Réalisé proche du prévu (945, 852, 216) : un conforme, un à surveiller, un hors seuil. */
const saisirLeRealise: Etapes = async (page) => {
  await cliquerTexte(page, 'Réalisé');
  await remplir(page, realise(page, 0), '940');
  await remplir(page, realise(page, 1), '760');
  await remplir(page, realise(page, 2), '100');
};

/** Consommation de 6 sacs, tout juste : farine 300 kg, sel 3 600 g, levure 2 700 g, améliorant 1 800 g. */
const saisirLaConsommationJuste: Etapes = async (page) => {
  await cliquerTexte(page, 'Consommation');
  const valeurs = ['300', '3600', '2700', '1800', '30', '1', '3'];
  for (const [rang, valeur] of valeurs.entries()) await remplir(page, conso(page, rang), valeur);
};

const saisirLaConsommationEnEcart: Etapes = async (page) => {
  await cliquerTexte(page, 'Consommation');
  const valeurs = ['320', '3600', '2700', '1800', '30', '1', '3'];
  for (const [rang, valeur] of valeurs.entries()) await remplir(page, conso(page, rang), valeur);
};

/** Réalisé et consommation complets, prêts à clôturer. */
const toutSaisir: Etapes = async (page) => {
  await saisirLeRealise(page);
  await saisirLaConsommationJuste(page);
};

const clore: Etapes = (page) => cliquerTexte(page, 'Clôturer la production');

export const scenariosProduction: Scenario[] = [
  // Les cinq étapes du cycle, vues par le chef de production.
  scenarioProduction({ nom: 'production-commandes', etape: 'commandes' }),
  scenarioProduction({ nom: 'production-plan-propose', etape: 'plan-propose' }),
  scenarioProduction({ nom: 'production-plan-valide', etape: 'plan-valide' }),
  scenarioProduction({ nom: 'production-en-cours' }),
  // Le gérant valide le plan ; hors de son tour, il attend.
  scenarioProduction({ nom: 'production-gerant-valide', profil: /Willy/, etape: 'plan-propose' }),
  scenarioProduction({ nom: 'production-gerant-attend', profil: /Willy/, etape: 'commandes' }),
  // Réalisé : conforme, à surveiller, hors seuil.
  scenarioProduction({ nom: 'production-realise', onglet: 'Réalisé' }),
  scenarioProduction({ nom: 'production-realise-saisi', etapes: saisirLeRealise }),
  // Consommation : vide, juste, en écart (alerte et justification), justification envoyée.
  scenarioProduction({ nom: 'production-consommation', onglet: 'Consommation' }),
  scenarioProduction({ nom: 'production-consommation-juste', etapes: saisirLaConsommationJuste }),
  scenarioProduction({
    nom: 'production-consommation-ecart',
    etapes: saisirLaConsommationEnEcart,
  }),
  scenarioProduction({
    nom: 'production-consommation-motif',
    etapes: async (page) => {
      await saisirLaConsommationEnEcart(page);
      await cliquerTexte(page, 'Brûlé');
      await remplir(page, page.getByPlaceholder('Précisez (facultatif)'), 'Four 2');
    },
  }),
  scenarioProduction({
    nom: 'production-consommation-envoyee',
    etapes: async (page) => {
      await saisirLaConsommationEnEcart(page);
      await cliquerTexte(page, 'Brûlé');
      await cliquerTexte(page, 'Envoyer au gérant');
      await attendreFinDuToast(page);
    },
  }),
  // Clôture impossible sans le réalisé ni la consommation : le toast puis l'onglet qui manque.
  scenarioProduction({ nom: 'production-cloture-impossible', etapes: clore }),
  scenarioProduction({
    nom: 'production-cloture-sans-consommation',
    etapes: async (page) => {
      await saisirLeRealise(page);
      await clore(page);
    },
  }),
  scenarioProduction({
    nom: 'production-cloture-fenetre',
    etapes: async (page) => {
      await toutSaisir(page);
      await clore(page);
    },
  }),
  scenarioProduction({
    nom: 'production-cloturee',
    seuil: 1,
    justification:
      'Un pixel du badge des notifications (écart 13/255) après l’action : anticrénelage du badge, à reprendre quand le compteur sera calculé comme le prototype.',
    etapes: async (page) => {
      await toutSaisir(page);
      await clore(page);
      await cliquerTexte(page, 'Clôturer et enregistrer');
      await attendreFinDuToast(page);
      await cliquerTexte(page, 'Plan');
    },
  }),
  // Supplément : avant la validation il s'ajoute au plan, après il part en demande au gérant.
  scenarioProduction({
    nom: 'production-supplement-saisi',
    etape: 'commandes',
    etapes: async (page) => {
      await cliquerTexte(page, 'Reprendre la suggestion');
    },
  }),
  scenarioProduction({
    nom: 'production-supplement-ajoute',
    seuil: 1,
    justification:
      'Un pixel du badge des notifications (écart 13/255) après l’action : anticrénelage du badge, à reprendre quand le compteur sera calculé comme le prototype.',
    etape: 'commandes',
    etapes: async (page) => {
      await cliquerTexte(page, 'Reprendre la suggestion');
      await cliquerTexte(page, /^Ajouter au plan/);
      await attendreFinDuToast(page);
    },
  }),
  scenarioProduction({
    nom: 'production-supplement-sans-motif',
    etape: 'commandes',
    etapes: async (page) => {
      await cliquerTexte(page, '+');
      await cliquerTexte(page, /^Ajouter au plan/);
    },
  }),
  scenarioProduction({
    nom: 'production-supplement-demande',
    etapes: async (page) => {
      await cliquerTexte(page, 'Reprendre la suggestion');
      await cliquerTexte(page, /^Demander \+1 sac\(s\) au gérant/);
      await attendreFinDuToast(page);
    },
  }),
  // Le propriétaire consulte seulement.
  scenarioProduction({ nom: 'production-proprietaire', profil: /Fotso/ }),
  scenarioProduction({
    nom: 'production-proprietaire-realise',
    profil: /Fotso/,
    onglet: 'Réalisé',
    zones: { contenu: { ...CONTENU, height: 1060 } },
    hauteur: 1300,
  }),
];

/** Ouvre la fiche technique du produit BAG depuis les cartes du plan. */
const ouvrirLaFiche: Etapes = async (page) => {
  await page.getByText('Fiche technique ›').first().click();
  await page.getByText('Procédé de fabrication', { exact: true }).waitFor();
  // Le clic fait défiler la page : on la remet en haut des deux côtés.
  await page.evaluate(() => {
    document.querySelector('main')?.scrollTo(0, 0);
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
};

/** Premier champ qui suit l'étiquette (même geste dans le prototype, qui n'étiquette pas ses champs). */
const champFiche = (page: Page, etiquette: string) =>
  page.locator(`xpath=(//span[normalize-space()="${etiquette}"])[1]/following::input[1]`);
const modifierLaFiche: Etapes = async (page) => {
  await ouvrirLaFiche(page);
  await cliquerTexte(page, 'Modifier la fiche');
};
/**
 * Sous la rangée « retour » et l'en-tête de la fiche : le prototype y met d'autres libellés pour le
 * propriétaire (« Tous les produits ») et date toujours une modification du « 15 oct. ».
 */
const SOUS_L_ENTETE = (hauteur: number): Record<string, Zone> => ({
  contenu: { x: 248, y: 330, width: 1032, height: hauteur - 330 },
});

export const scenariosFiche: Scenario[] = [
  scenarioProduction({ nom: 'production-fiche', etapes: ouvrirLaFiche, hauteur: 1500 }),
  scenarioProduction({
    nom: 'production-fiche-sans-prix',
    etapes: async (page) => {
      await ouvrirLaFiche(page);
      await cliquerTexte(page, 'GC 170');
    },
    hauteur: 1500,
  }),
  scenarioProduction({
    nom: 'production-fiche-perte',
    etapes: async (page) => {
      await ouvrirLaFiche(page);
      await cliquerTexte(page, 'KO');
    },
    hauteur: 1500,
  }),
  scenarioProduction({
    nom: 'production-fiche-modifier',
    profil: /Fotso/,
    etapes: modifierLaFiche,
    hauteur: 1500,
    zones: SOUS_L_ENTETE(1500),
  }),
  scenarioProduction({
    nom: 'production-fiche-erreur',
    profil: /Fotso/,
    etapes: async (page) => {
      await modifierLaFiche(page);
      await remplir(page, champFiche(page, 'Sel'), '0');
      await cliquerTexte(page, /^Enregistrer · version 4$/);
    },
    hauteur: 1500,
    zones: SOUS_L_ENTETE(1500),
  }),
  scenarioProduction({
    nom: 'production-fiche-modifiee',
    profil: /Fotso/,
    etapes: async (page) => {
      await modifierLaFiche(page);
      await remplir(page, champFiche(page, 'Sel'), '0,7');
      await remplir(page, champFiche(page, 'Poids de la boule'), '4000');
      await cliquerTexte(page, /^Enregistrer · version 4$/);
      await attendreFinDuToast(page);
    },
    hauteur: 1500,
    zones: SOUS_L_ENTETE(1500),
  }),
];
