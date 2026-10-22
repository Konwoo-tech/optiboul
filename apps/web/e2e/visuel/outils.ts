import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, Page } from '@playwright/test';

import type { VarianteDuPrototype } from './scenario.ts';

const ici = dirname(fileURLToPath(import.meta.url));
export const RACINE_WEB = join(ici, '..', '..');
const DOSSIER_PROTOTYPE = join(RACINE_WEB, '..', '..', 'docs', 'design', 'claude-design');
export const DOSSIER_SORTIE = join(ici, 'sortie');

/** Seuil d'écart par canal (sur 255) au-delà duquel un pixel compte comme différent. */
export const ECART_PAR_CANAL = 8;

/** Instant figé pour le prototype comme pour l'application : 18 h 02 à Yaoundé. */
export const INSTANT_FIGE = '2026-10-14T17:02:00Z';

export function portLibre(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address();
      const port = typeof adresse === 'object' && adresse ? adresse.port : 0;
      serveur.close(() => resoudre(port));
    });
  });
}

export interface ServeurApplication {
  url: string;
  arreter: () => void;
}

/** Lance `vite --mode simulation` sur un port libre et attend qu'il réponde. */
export async function demarrerApplication(): Promise<ServeurApplication> {
  const port = await portLibre();
  const exigence = createRequire(join(RACINE_WEB, 'package.json'));
  const vite = join(dirname(exigence.resolve('vite/package.json')), 'bin', 'vite.js');
  const enfant: ChildProcess = spawn(
    process.execPath,
    [vite, '--mode', 'simulation', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: RACINE_WEB, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let journal = '';
  enfant.stdout?.on('data', (m: Buffer) => (journal += m.toString()));
  enfant.stderr?.on('data', (m: Buffer) => (journal += m.toString()));
  let sorti = false;
  enfant.once('exit', () => (sorti = true));

  const url = `http://127.0.0.1:${port}`;
  const echeance = Date.now() + 60_000;
  for (;;) {
    if (sorti) throw new Error(`Vite s'est arrêté au démarrage :\n${journal}`);
    try {
      const reponse = await fetch(url);
      if (reponse.ok) break;
    } catch {
      // pas encore prêt
    }
    if (Date.now() > echeance) {
      enfant.kill();
      throw new Error(`Vite n'a pas répondu en 60 s :\n${journal}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { url, arreter: () => enfant.kill() };
}

export interface PrototypeTemporaire {
  /** Adresse `file://` de chaque variante. */
  urls: Record<VarianteDuPrototype, string>;
  supprimer: () => void;
}

/**
 * Copie le prototype (et `support.js`) dans un dossier temporaire, hors dépôt, avec les
 * propriétés `data-props` modifiées pour chaque variante.
 */
export function preparerPrototype(): PrototypeTemporaire {
  const racine = mkdtempSync(join(tmpdir(), 'optiboul-prototype-'));
  const source = readFileSync(join(DOSSIER_PROTOTYPE, 'OptiBoul ERP v2.dc.html'), 'utf8');
  const motif = {
    mode: '&quot;default&quot;:&quot;Google ou e-mail&quot;',
    deuxFacteurs:
      '&quot;twoFactor&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:true',
  };
  if (!source.includes(motif.mode) || !source.includes(motif.deuxFacteurs)) {
    throw new Error('Les data-props du prototype ont changé : adapter preparerPrototype().');
  }
  const urls = {} as Record<VarianteDuPrototype, string>;
  for (const variante of ['email', 'code'] as const) {
    const dossier = join(racine, variante);
    mkdirSync(dossier);
    copyFileSync(join(DOSSIER_PROTOTYPE, 'support.js'), join(dossier, 'support.js'));
    const html =
      variante === 'email'
        ? source
        : source
            .replace(motif.mode, '&quot;default&quot;:&quot;Nom et code&quot;')
            .replace(motif.deuxFacteurs, motif.deuxFacteurs.replace('true', 'false'));
    writeFileSync(join(dossier, 'index.html'), html);
    urls[variante] = `file:///${join(dossier, 'index.html').replaceAll('\\', '/')}`;
  }
  return { urls, supprimer: () => rmSync(racine, { recursive: true, force: true }) };
}

export interface Difference {
  largeur: number;
  hauteur: number;
  tailles: { prototype: [number, number]; application: [number, number] };
  differents: number;
  total: number;
  ecartMax: number;
  /** Bandes de lignes et de colonnes (début, fin) touchées, pour se repérer dans l'image. */
  lignes: [number, number][];
  colonnes: [number, number][];
}

/** Compare deux PNG pixel à pixel dans le navigateur (aucune dépendance à installer). */
export async function comparer(
  navigateur: Browser,
  cheminPrototype: string,
  cheminApplication: string,
  cheminDifference: string,
): Promise<Difference> {
  const contexte = await navigateur.newContext();
  const page: Page = await contexte.newPage();
  const a = readFileSync(cheminPrototype).toString('base64');
  const b = readFileSync(cheminApplication).toString('base64');
  const resultat = await page.evaluate(
    async ([a, b, ecartParCanal]) => {
      const charger = (b64: string) =>
        new Promise<HTMLImageElement>((resoudre) => {
          const image = new Image();
          image.onload = () => resoudre(image);
          image.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([charger(a!), charger(b!)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const lire = (image: HTMLImageElement) => {
        const toile = document.createElement('canvas');
        toile.width = w;
        toile.height = h;
        const c = toile.getContext('2d', { willReadFrequently: true })!;
        // Le magenta signale les pixels hors image quand les tailles diffèrent.
        c.fillStyle = '#ff00ff';
        c.fillRect(0, 0, w, h);
        c.drawImage(image, 0, 0);
        return c.getImageData(0, 0, w, h);
      };
      const da = lire(ia);
      const db = lire(ib);
      const sortie = document.createElement('canvas');
      sortie.width = w;
      sortie.height = h;
      const sx = sortie.getContext('2d')!;
      const ds = sx.createImageData(w, h);
      let differents = 0;
      let ecartMax = 0;
      const lignes = new Array<number>(h).fill(0);
      const colonnes = new Array<number>(w).fill(0);
      for (let i = 0; i < da.data.length; i += 4) {
        const e = Math.max(
          Math.abs(da.data[i]! - db.data[i]!),
          Math.abs(da.data[i + 1]! - db.data[i + 1]!),
          Math.abs(da.data[i + 2]! - db.data[i + 2]!),
        );
        const px = i / 4;
        if (e > ecartParCanal!) {
          differents++;
          lignes[Math.floor(px / w)]!++;
          colonnes[px % w]!++;
          ds.data[i] = 255;
          ds.data[i + 1] = 0;
          ds.data[i + 2] = 0;
        } else {
          // Fond en gris clair tiré du prototype, pour situer les écarts.
          ds.data[i] = ds.data[i + 1] = ds.data[i + 2] = Math.round(da.data[i]! * 0.3 + 160);
        }
        ds.data[i + 3] = 255;
        if (e > ecartMax) ecartMax = e;
      }
      sx.putImageData(ds, 0, 0);
      const bandes = (tab: number[]) => {
        const sortieBandes: [number, number][] = [];
        let debut: number | null = null;
        for (let k = 0; k <= tab.length; k++) {
          const actif = k < tab.length && tab[k]! > 0;
          if (actif && debut === null) debut = k;
          if (!actif && debut !== null) {
            sortieBandes.push([debut, k - 1]);
            debut = null;
          }
        }
        return sortieBandes.slice(0, 12);
      };
      return {
        largeur: w,
        hauteur: h,
        tailles: {
          prototype: [ia.width, ia.height] as [number, number],
          application: [ib.width, ib.height] as [number, number],
        },
        differents,
        total: w * h,
        ecartMax,
        lignes: bandes(lignes),
        colonnes: bandes(colonnes),
        png: sortie.toDataURL('image/png').split(',')[1]!,
      };
    },
    [a, b, ECART_PAR_CANAL] as const,
  );
  await contexte.close();
  writeFileSync(cheminDifference, Buffer.from(resultat.png, 'base64'));
  const { png: _png, ...difference } = resultat;
  return difference;
}

/** Attend le chargement des polices puis une demi-seconde de stabilité. */
export async function attendrePolices(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/** Clique le premier bouton portant ce nom accessible. */
export function cliquer(page: Page, nom: string | RegExp): Promise<void> {
  return page.getByRole('button', { name: nom }).first().click();
}
