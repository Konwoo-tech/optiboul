import { formaterDateCourte } from '@/utils';

import { jourCourt } from '../../atelier/stocks/affichage.ts';

/** Le premier du mois s'écrit « 1er » en français, comme dans la maquette (« 1er nov. »). */
const premier = (iso: string, langue: string) => langue !== 'en' && iso.endsWith('-01');

/** « 5 oct. » (français) ou « Oct 5 » (anglais) pour un jour ISO. */
export function jourMois(iso: string, langue: string): string {
  const texte = formaterDateCourte(new Date(`${iso}T12:00:00Z`), langue);
  return premier(iso, langue) ? texte.replace(/^1 /, '1er ') : texte;
}

/** « lun. 12 oct. » (français) ou « Mon Oct 12 » (anglais) pour un jour ISO. */
export function jourSemaine(iso: string, langue: string): string {
  const texte = jourCourt(iso, langue);
  return premier(iso, langue) ? texte.replace(/ 1 /, ' 1er ') : texte;
}

/** « lun. 12 oct. · 05:55 » : le jour et l'heure d'une ouverture ou d'une clôture. */
export const jourEtHeure = (iso: string, heure: string, langue: string) =>
  `${jourSemaine(iso, langue)} · ${heure}`;
