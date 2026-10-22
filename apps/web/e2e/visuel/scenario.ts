import type { Page } from '@playwright/test';

import { ECART_PAR_CANAL } from './outils.ts';

/** Zone rectangulaire de la page, en pixels CSS (comme `clip` de Playwright). */
export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Adresses utiles aux fonctions qui jouent un scénario. */
export interface Environnement {
  /** Adresse du prototype (copie temporaire, voir `variante`). */
  urlPrototype: string;
  /** Adresse de base de l'application lancée en mode simulation (sans barre oblique finale). */
  urlApplication: string;
}

export type Jouer = (page: Page, env: Environnement) => Promise<void>;

/**
 * Le prototype se pilote par ses propriétés `data-props`. Le banc en fait une copie
 * temporaire modifiée (le fichier du dépôt n'est jamais touché) :
 * - `email` : réglages d'origine, connexion « Google ou e-mail » avec double authentification ;
 * - `code` : connexion « Nom et code », sans double authentification.
 */
export type VarianteDuPrototype = 'email' | 'code';

export interface Scenario {
  /** Identifiant court, sert de nom aux images et d'argument de la ligne de commande. */
  nom: string;
  /** Variante du prototype à ouvrir. */
  variante: VarianteDuPrototype;
  /** 1280 x 800 par défaut. */
  viewport?: { width: number; height: number };
  /** Préférence du système : `clair` par défaut. */
  theme?: 'clair' | 'sombre';
  /** Joue le scénario dans le prototype, jusqu'à l'état à photographier. */
  prototype: Jouer;
  /** Joue le même scénario dans l'application. */
  application: Jouer;
  /** Zones à comparer, par nom. Sans zone, toute la fenêtre est comparée. */
  zones?: Record<string, Zone>;
  /** Nombre de pixels différents toléré, 0 par défaut. */
  seuil?: number;
  /** Écart toléré par canal, sur 255 (défaut : `ECART_PAR_CANAL` de `outils.ts`). */
  tolerance?: number;
  /** Obligatoire dès que `seuil` > 0 ou que `tolerance` s'écarte du défaut : pourquoi. */
  justification?: string;
}

/** Vérifie la définition d'un scénario (une tolérance sans justification est refusée). */
export function definirScenario(scenario: Scenario): Scenario {
  const deroge =
    (scenario.seuil ?? 0) > 0 ||
    (scenario.tolerance !== undefined && scenario.tolerance !== ECART_PAR_CANAL);
  if (deroge && !scenario.justification?.trim()) {
    throw new Error(
      `Scénario « ${scenario.nom} » : un seuil ou une tolérance hors défaut exige une justification écrite.`,
    );
  }
  return scenario;
}
