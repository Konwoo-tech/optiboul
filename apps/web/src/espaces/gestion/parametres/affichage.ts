import { formaterNombre, FUSEAU_BOULANGERIE } from '@/utils';
import type { TFunction } from 'i18next';

import type { ErreurValeur, Parametre, ValeurParametre } from './types.ts';

/** Libellé traduit d'un paramètre ; celui du serveur si la clé n'a pas de traduction. */
export const libelleDe = (t: TFunction, parametre: Pick<Parametre, 'cle' | 'libelle'>): string =>
  t(`gestion.parametres.libelles.${parametre.cle}`, { defaultValue: parametre.libelle });

/**
 * Unité traduite : « heures (et à chaque clôture) » devient « heures », « % de la moyenne… » devient
 * « % ». Vide quand la valeur n'a pas d'unité.
 */
export function uniteDe(t: TFunction, parametre: Pick<Parametre, 'unite'>): string {
  const mot = parametre.unite.split(' (')[0]!.split(' ')[0]!;
  return mot ? t(`gestion.parametres.unites.${mot}`, { defaultValue: mot }) : '';
}

export const nomDuJour = (t: TFunction, jour: string): string =>
  t(`gestion.parametres.jours.${jour}`, { defaultValue: jour });

/** La valeur telle qu'on la lit : « 2 000 FCFA », « 5 % », « 10:00 », « jeudi, samedi ». */
export function valeurLisible(
  t: TFunction,
  parametre: Pick<Parametre, 'genre' | 'unite'>,
  valeur: ValeurParametre,
): string {
  if (Array.isArray(valeur)) return valeur.map((jour) => nomDuJour(t, jour)).join(', ');
  if (typeof valeur === 'string') {
    return parametre.genre === 'jour' ? nomDuJour(t, valeur) : valeur;
  }
  const unite = uniteDe(t, parametre);
  const nombre = formaterNombre(valeur);
  if (parametre.genre === 'pourcentage') return `${nombre} %`;
  return unite ? `${nombre} ${unite}` : nombre;
}

/** Ce qui peut s'afficher sous un champ : un refus de valeur, un échec d'envoi ou la phrase du serveur. */
export type ErreurAffichee =
  ErreurValeur | 'serveur' | 'droit' | { code: 'message'; texte: string };

/** Phrase d'erreur d'une valeur refusée, dans la langue de l'interface. */
export function messageDErreur(t: TFunction, erreur: ErreurAffichee): string {
  if (erreur === 'serveur' || erreur === 'droit') return t(`gestion.parametres.erreurs.${erreur}`);
  switch (erreur.code) {
    case 'message':
      return erreur.texte;
    case 'bornes':
      return erreur.maximum === null
        ? t('gestion.parametres.erreurs.bornesMin', { minimum: erreur.minimum })
        : t('gestion.parametres.erreurs.bornes', {
            minimum: erreur.minimum,
            maximum: erreur.maximum,
          });
    case 'choix':
      return t('gestion.parametres.erreurs.choix', { permis: erreur.permis.join(', ') });
    default:
      return t(`gestion.parametres.erreurs.${erreur.code}`);
  }
}

/** « 14 oct., 18:02 » : l'instant d'une modification, à l'heure de la boulangerie. */
export function dateHeure(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(new Date(iso));
}
