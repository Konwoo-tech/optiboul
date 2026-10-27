import { formaterDateCourte, formaterNombre, type Creneau } from '@/utils';
import type { TFunction } from 'i18next';

import { unChiffre } from './regles.ts';
import type { CleProduit, Matiere } from './types.ts';

/** « 14 oct. » pour un jour ISO (« 2026-10-14 »). */
export function dateCourte(iso: string, langue: string): string {
  return formaterDateCourte(new Date(`${iso}T12:00:00Z`), langue);
}

/** « session de nuit » : le nom de la session, en minuscules, pour le titre du cycle. */
export const nomDeSessionCourt = (t: TFunction, type: Creneau): string =>
  t(`creneau.${type}`).toLocaleLowerCase();

/** Libellé d'un produit : « GC 135 » pour la ligne GC, comme la maquette. */
export const libelleProduit = (cle: CleProduit): string => (cle === 'GC' ? 'GC 135' : cle);

/** « +3 pains · +1,2 % » : un écart signé en nombre (moins typographique) puis en pourcentage. */
export function ecartEnPains(ecart: number, pourcent: number, langue: string): string {
  const nombre = `${ecart > 0 ? '+' : ''}${formaterNombre(ecart)}`;
  return `${nombre} · ${pourcent > 0 ? '+' : ''}${unChiffre(pourcent, langue)} %`;
}

/** « 1,2 % », signe « + » devant un écart positif et moins simple devant un négatif (maquette). */
export const pourcentSigne = (pourcent: number, langue: string): string =>
  `${pourcent > 0 ? '+' : ''}${unChiffre(pourcent, langue)} %`;

/** Unité de la matière dans la saisie de consommation (« kg », « g », « sachets »…). */
export const uniteDeSaisie = (t: TFunction, matiere: Matiere): string =>
  t(`atelier.production.consommation.unites.${matiere}`);

export const nomDeMatiere = (t: TFunction, matiere: Matiere): string =>
  t(`comptoir.depenses.matieres.${matiere}.nom`);

/**
 * « mer. 14 oct. » en français, « Wed Oct 14 » en anglais : jour de la semaine, jour et mois,
 * comme `dt(dayLabel(…))` de la maquette (l'anglais n'a pas de virgule).
 */
export function jourComplet(iso: string, langue: string): string {
  const parties = new Intl.DateTimeFormat(langue, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const valeur = (type: string) => parties.find((p) => p.type === type)?.value ?? '';
  return langue === 'en'
    ? `${valeur('weekday')} ${valeur('month')} ${valeur('day')}`
    : `${valeur('weekday')} ${valeur('day')} ${valeur('month')}`;
}
