import { ErreurApi } from '@/api';
import type { TFunction } from 'i18next';

/**
 * Le message d'un refus du serveur (champ `detail`, en français) : seulement pour un refus métier
 * (code connu du serveur, erreur 4xx).
 */
export function detailDuServeur(erreur: unknown): string | undefined {
  if (!(erreur instanceof ErreurApi)) return undefined;
  const refusMetier = Boolean(erreur.code) && erreur.status >= 400 && erreur.status < 500;
  return refusMetier && erreur.message ? erreur.message : undefined;
}

/**
 * Affiche le message de l'écran pour un refus ; quand l'écran n'en a pas de spécifique (la clé est
 * celle du message « erreur », « impossible » ou « défaut »), c'est le message du serveur qui est
 * affiché plutôt qu'un « Réessayez » qui ne dit rien.
 */
export function afficherRefus(
  afficher: (message: string) => void,
  t: TFunction,
  erreur: unknown,
  cle: string,
) {
  const generique = /\.(erreur|impossible|defaut)$/.test(cle);
  afficher((generique ? detailDuServeur(erreur) : undefined) ?? t(cle));
}

const PREFIXE_TEXTE = 'texte:';

/**
 * Ce qu'un écran garde d'un refus pour l'afficher plus tard : le code quand l'écran sait le dire,
 * sinon le message du serveur (précédé de `texte:`), sinon le code seul. Évite le « Réessayez » qui
 * cache pourquoi le serveur a refusé.
 */
export function codeOuTexte(erreur: unknown, connu: (code: string) => boolean): string | undefined {
  const code = erreur instanceof ErreurApi ? erreur.code : undefined;
  if (code && connu(code)) return code;
  const detail = detailDuServeur(erreur);
  return detail ? `${PREFIXE_TEXTE}${detail}` : code;
}

/** Vrai quand le refus gardé est le message du serveur (voir `codeOuTexte`). */
export const estTexteDuServeur = (code: string): boolean => code.startsWith(PREFIXE_TEXTE);

/** Le message du serveur gardé par `codeOuTexte`. */
export const texteDuServeur = (code: string): string => code.slice(PREFIXE_TEXTE.length);

/** Le message d'une erreur de fenêtre : le serveur d'abord, sinon le texte par défaut de l'écran. */
export function messageOuDefaut(erreur: unknown, defaut: string): string {
  return detailDuServeur(erreur) ?? defaut;
}
