import { formaterDateCourte, type Creneau } from '@/utils';
import type { TFunction } from 'i18next';

import type { ModePaiement } from './types.ts';

/** « 14 oct. » pour un jour ISO (« 2026-10-14 »). */
export function dateCourte(iso: string, langue: string): string {
  return formaterDateCourte(new Date(`${iso}T12:00:00Z`), langue);
}

/** « dimanche 18 octobre » (français) ou « Sunday, October 18 » (anglais), sans l'année. */
export function dateSansAnnee(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** « Session de nuit ». */
export function nomDeSession(t: TFunction, type: Creneau): string {
  return t(`creneau.${type}`);
}

/** « Espèces » ; en minuscules pour le bon de livraison. */
export function libelleDuMode(t: TFunction, mode: ModePaiement): string {
  return t(`comptoir.session.modes.${mode}`);
}
