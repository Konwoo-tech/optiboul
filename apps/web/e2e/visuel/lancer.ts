// Contrôle visuel : compare image par image le prototype de design et l'application.
// Usage : pnpm e2e:visuel [nom-de-scénario...]   (sans argument : tous les scénarios)
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';

import {
  comparer,
  demarrerApplication,
  DOSSIER_SORTIE,
  ECART_PAR_CANAL,
  INSTANT_FIGE,
  preparerPrototype,
  type Difference,
  type PrototypeTemporaire,
  type ServeurApplication,
} from './outils.ts';
import { scenarios } from './scenarios/index.ts';
import type { Scenario, Zone } from './scenario.ts';

interface Ligne {
  nom: string;
  difference: Difference;
  seuil: number;
  tolerance: number;
  reussi: boolean;
}

const arguments_ = process.argv.slice(2);
const options = arguments_.filter((a) => a.startsWith('-'));
if (options.length > 0) {
  console.error(`Option inconnue : ${options.join(', ')} (le banc n'en accepte aucune)`);
  process.exit(2);
}
const demandes = arguments_;
const inconnus = demandes.filter((d) => !scenarios.some((s) => s.nom === d));
if (inconnus.length > 0) {
  console.error(
    `Scénario inconnu : ${inconnus.join(', ')}\nDisponibles : ${scenarios.map((s) => s.nom).join(', ')}`,
  );
  process.exit(2);
}
const retenus = scenarios.filter((s) => demandes.length === 0 || demandes.includes(s.nom));
if (retenus.length === 0) {
  console.error('Aucun scénario à jouer.');
  process.exit(2);
}

// Les noms de fichiers de sortie doivent être uniques, sinon deux scénarios s'écraseraient.
const fichiers = scenarios.flatMap((s) =>
  s.zones ? Object.keys(s.zones).map((z) => `${s.nom}-${z}`) : [s.nom],
);
if (new Set(fichiers).size !== fichiers.length) {
  console.error('Deux scénarios ou zones produiraient les mêmes fichiers de sortie.');
  process.exit(2);
}

rmSync(DOSSIER_SORTIE, { recursive: true, force: true });
mkdirSync(DOSSIER_SORTIE, { recursive: true });

// Variables renseignées au fur et à mesure : le nettoyage final n'arrête que ce qui a démarré.
let prototype: PrototypeTemporaire | undefined;
let application: ServeurApplication | undefined;
let navigateur: Browser | undefined;
const lignes: Ligne[] = [];

async function ouvrirPage(scenario: Scenario) {
  const contexte = await navigateur!.newContext({
    viewport: scenario.viewport ?? { width: 1280, height: 800 },
    colorScheme: scenario.theme === 'sombre' ? 'dark' : 'light',
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    deviceScaleFactor: 1,
  });
  const page = await contexte.newPage();
  // Date figée, minuteries actives : l'application et le prototype affichent la même heure.
  await page.clock.setFixedTime(new Date(INSTANT_FIGE));
  return { contexte, page };
}

// Chaque page est photographiée juste après son scénario (les toasts durent 3 s), sans focus :
// le prototype essaie de focaliser le champ de code trop tôt, l'application y parvient.
async function capturer(page: Page, scenario: Scenario, cote: 'prototype' | 'application') {
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  const zones: [string, Zone | undefined][] = scenario.zones
    ? Object.entries(scenario.zones)
    : [['page', undefined]];
  for (const [zone, clip] of zones) {
    const suffixe = scenario.zones ? `${scenario.nom}-${zone}` : scenario.nom;
    await page.screenshot({
      path: join(DOSSIER_SORTIE, `${suffixe}-${cote}.png`),
      animations: 'disabled',
      ...(clip ? { clip } : {}),
    });
  }
}

try {
  prototype = preparerPrototype();
  application = await demarrerApplication();
  // OPTIBOUL_VISUEL_NAVIGATEUR : chemin d'un autre exécutable Chromium ou Chrome (facultatif).
  navigateur = await chromium.launch({ executablePath: process.env.OPTIBOUL_VISUEL_NAVIGATEUR });
  for (const scenario of retenus) {
    const env = {
      urlPrototype: prototype.urls[scenario.variante],
      urlApplication: application.url,
    };
    const a = await ouvrirPage(scenario);
    const b = await ouvrirPage(scenario);
    try {
      await scenario.prototype(a.page, env);
      await capturer(a.page, scenario, 'prototype');
      await scenario.application(b.page, env);
      await capturer(b.page, scenario, 'application');
    } catch (e) {
      console.error(
        `Scénario « ${scenario.nom} » en échec : ${e instanceof Error ? e.message : String(e)}`,
      );
      await a.page
        .screenshot({ path: join(DOSSIER_SORTIE, `${scenario.nom}-ECHEC-prototype.png`) })
        .catch(() => {});
      await b.page
        .screenshot({ path: join(DOSSIER_SORTIE, `${scenario.nom}-ECHEC-application.png`) })
        .catch(() => {});
      process.exitCode = 1;
      continue;
    } finally {
      await a.contexte.close();
      await b.contexte.close();
    }
    const zones = scenario.zones ? Object.keys(scenario.zones) : [undefined];
    for (const zone of zones) {
      const base = zone ? `${scenario.nom}-${zone}` : scenario.nom;
      const difference = await comparer(
        navigateur,
        join(DOSSIER_SORTIE, `${base}-prototype.png`),
        join(DOSSIER_SORTIE, `${base}-application.png`),
        join(DOSSIER_SORTIE, `${base}-difference.png`),
        scenario.tolerance,
      );
      const seuil = scenario.seuil ?? 0;
      const memeTaille =
        difference.tailles.prototype.join('x') === difference.tailles.application.join('x');
      lignes.push({
        nom: zone ? `${scenario.nom} : ${zone}` : scenario.nom,
        difference,
        seuil,
        tolerance: scenario.tolerance ?? ECART_PAR_CANAL,
        reussi: memeTaille && difference.differents <= seuil,
      });
    }
  }
} finally {
  await navigateur?.close().catch(() => {});
  application?.arreter();
  prototype?.supprimer();
}

const largeurNom = Math.max(8, ...lignes.map((l) => l.nom.length));
console.log(
  `\nUn pixel compte comme différent au-delà de la tolérance par canal (par défaut ${ECART_PAR_CANAL}/255) : « 0 pixel » veut dire « 0 pixel au-dessus de la tolérance ».`,
);
console.log(
  `${'Scénario'.padEnd(largeurNom)}  ${'Pixels'.padStart(8)}  ${'%'.padStart(7)}  ${'Seuil'.padStart(6)}  ${'Toler.'.padStart(6)}  ${'Ecart max'.padStart(9)}  Résultat`,
);
for (const l of lignes) {
  const pourcent = ((100 * l.difference.differents) / l.difference.total).toFixed(2);
  console.log(
    `${l.nom.padEnd(largeurNom)}  ${String(l.difference.differents).padStart(8)}  ${pourcent.padStart(7)}  ${String(l.seuil).padStart(6)}  ${String(l.tolerance).padStart(6)}  ${`${l.difference.ecartMax}/255`.padStart(9)}  ${l.reussi ? 'OK' : 'ÉCART'}`,
  );
  if (!l.reussi) {
    const { tailles, lignes: bandesLignes, colonnes } = l.difference;
    if (tailles.prototype.join('x') !== tailles.application.join('x')) {
      console.log(
        `    tailles différentes : prototype ${tailles.prototype.join('x')}, application ${tailles.application.join('x')}`,
      );
    }
    const texte = (bandes: [number, number][]) =>
      bandes.map(([d, f]) => (d === f ? `${d}` : `${d}-${f}`)).join(', ');
    console.log(
      `    lignes touchées : ${texte(bandesLignes)}\n    colonnes touchées : ${texte(colonnes)}`,
    );
  }
}
console.log(`\nImages (prototype, application, différence) : ${DOSSIER_SORTIE}`);

if (lignes.some((l) => !l.reussi)) process.exitCode = 1;
