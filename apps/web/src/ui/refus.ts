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
