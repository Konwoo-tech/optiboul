import type { Profil } from '../../../profils.ts';
import { formaterDateCourte, formaterHeure } from '../../../utils';

/*
 * Règles de « Gestion › Sauvegardes » (cahier des charges §3.3 et §5.13, récits US-142 et US-143,
 * maquette « OptiBoul ERP v2 », fonction `vBackups`). TypeScript pur.
 */

/** Seul l'administrateur gère les sauvegardes (§3.3 : « Comptes, groupes, sauvegardes »). */
export const peutGererLesSauvegardes = (profil: Profil | null | undefined): boolean =>
  profil === 'administrateur';

/** « 14 oct. 21:30 » : la date courte puis l'heure, à l'heure de la boulangerie (maquette). */
export function libelleDeCopie(instant: string, langue: string = 'fr'): string {
  const date = new Date(instant);
  return `${formaterDateCourte(date, langue)} ${formaterHeure(date)}`;
}
