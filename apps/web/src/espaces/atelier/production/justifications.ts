import type { Justification } from './types.ts';

/**
 * Justifications d'écart de matière envoyées pendant cette visite, par production. Le serveur ne garde
 * une justification que pour les matières qu'il juge « en écart » (sa tolérance diffère de celle de
 * l'écran, et il ne la renvoie pas) : sans cette mémoire, l'écran redemanderait de justifier un écart
 * déjà justifié (E39).
 */
const envoyees = new Map<string, Justification>();

export const justificationEnvoyee = (production: string | undefined) =>
  production ? (envoyees.get(production) ?? null) : null;

export const retenirJustification = (production: string, justification: Justification) => {
  envoyees.set(production, justification);
};

/** Le texte envoyé au serveur pour chaque matière : le motif puis la précision. */
export const texteDeJustification = (justification: Justification) =>
  `${justification.motif} : ${justification.texte}`;
