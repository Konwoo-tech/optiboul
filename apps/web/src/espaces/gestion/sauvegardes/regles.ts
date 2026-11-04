import type { Profil } from '../../../profils.ts';
import { formaterDateCourte, formaterHeure } from '../../../utils';

/*
 * Règles de « Gestion › Sauvegardes » (cahier des charges §3.3 et §5.13, récits US-142 et US-143,
 * maquette « OptiBoul ERP v2 », fonction `vBackups`). TypeScript pur : le faux serveur et l'écran
 * appliquent les mêmes règles.
 */

/** Seul l'administrateur gère les sauvegardes (§3.3 : « Comptes, groupes, sauvegardes »). */
export const peutGererLesSauvegardes = (profil: Profil | null | undefined): boolean =>
  profil === 'administrateur';

/** Alerte quand la dernière copie cloud a plus de 48 h (§5.13 : « au-delà de 48 h sans copie »). */
export const SEUIL_ALERTE_CLOUD_HEURES = 48;

const HEURE_EN_MS = 3_600_000;

/**
 * La copie cloud est en retard quand elle a strictement plus de `seuilHeures` d'ancienneté, ou
 * qu'il n'y en a jamais eu. Une copie datée du futur (horloge décalée) n'est pas en retard.
 */
export function cloudEnRetard(
  derniereCloud: string | null,
  maintenant: Date,
  seuilHeures: number = SEUIL_ALERTE_CLOUD_HEURES,
): boolean {
  if (derniereCloud === null) return true;
  const instant = Date.parse(derniereCloud);
  if (Number.isNaN(instant)) return true;
  return maintenant.getTime() - instant > seuilHeures * HEURE_EN_MS;
}

/** « 14 oct. 21:30 » : la date courte puis l'heure, à l'heure de la boulangerie (maquette). */
export function libelleDeCopie(instant: string, langue: string = 'fr'): string {
  const date = new Date(instant);
  return `${formaterDateCourte(date, langue)} ${formaterHeure(date)}`;
}
