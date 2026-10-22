import { FUSEAU_BOULANGERIE } from './creneau.ts';

/** « Mercredi 14 octobre 2026 », à l'heure de la boulangerie (Yaoundé). */
export function formaterDateLongue(date: Date, langue: string): string {
  const texte = new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(date);
  return texte.charAt(0).toLocaleUpperCase(langue) + texte.slice(1);
}

/** « 14 oct. », sans l'année, à l'heure de la boulangerie. */
export function formaterDateCourte(date: Date, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'short',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(date);
}

/** « 18:02 », sur 24 heures, à l'heure de la boulangerie. */
export function formaterHeure(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: FUSEAU_BOULANGERIE,
  }).format(date);
}
