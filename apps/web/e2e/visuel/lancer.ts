// Contrôle visuel : compare image par image le prototype de design et l'application.
// Usage : pnpm e2e:visuel [nom-de-scénario...]   (sans argument : tous les scénarios)
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Page } from '@playwright/test';

import {
  comparer,
  demarrerApplication,
  DOSSIER_SORTIE,
  INSTANT_FIGE,
  preparerPrototype,
  type Difference,
} from './outils.ts';
import { scenarios } from './scenarios/index.ts';
import type { Scenario, Zone } from './scenario.ts';

interface Ligne {
  nom: string;
  difference: Difference;
  seuil: number;
  reussi: boolean;
}

const demandes = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const inconnus = demandes.filter((d) => !scenarios.some((s) => s.nom === d));
if (inconnus.length > 0) {
  console.error(
    `Scénario inconnu : ${inconnus.join(', ')}\nDisponibles : ${scenarios.map((s) => s.nom).join(', ')}`,
  );
  process.exit(2);
}
const noms = scenarios.map((s) => s.nom);
if (new Set(noms).size !== noms.length) {
  console.error('Deux scénarios portent le même nom.');
  process.exit(2);
}
const retenus = scenarios.filter((s) => demandes.length === 0 || demandes.includes(s.nom));

rmSync(DOSSIER_SORTIE, { recursive: true, force: true });
mkdirSync(DOSSIER_SORTIE, { recursive: true });

const prototype = preparerPrototype();
const application = await demarrerApplication();
const navigateur = await chromium.launch();
const lignes: Ligne[] = [];

async function ouvrirPage(scenario: Scenario) {
  const contexte = await navigateur.newContext({
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
      ...(clip ? { clip } : {}),
    });
  }
}

try {
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
      );
      const seuil = scenario.seuil ?? 0;
      const memeTaille =
        difference.tailles.prototype.join('x') === difference.tailles.application.join('x');
      lignes.push({
        nom: zone ? `${scenario.nom} : ${zone}` : scenario.nom,
        difference,
        seuil,
        reussi: memeTaille && difference.differents <= seuil,
      });
    }
  }
} finally {
  await navigateur.close();
  application.arreter();
  prototype.supprimer();
}

const largeurNom = Math.max(8, ...lignes.map((l) => l.nom.length));
console.log(
  `\n${'Scénario'.padEnd(largeurNom)}  ${'Pixels'.padStart(8)}  ${'%'.padStart(7)}  ${'Seuil'.padStart(6)}  Résultat`,
);
for (const l of lignes) {
  const pourcent = ((100 * l.difference.differents) / l.difference.total).toFixed(2);
  console.log(
    `${l.nom.padEnd(largeurNom)}  ${String(l.difference.differents).padStart(8)}  ${pourcent.padStart(7)}  ${String(l.seuil).padStart(6)}  ${l.reussi ? 'OK' : 'ÉCART'}`,
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
