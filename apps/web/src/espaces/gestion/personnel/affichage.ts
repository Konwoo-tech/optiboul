import type { NiveauStatut } from '@/utils';

import { joursEntre } from './regles.ts';
import type { InstantanePaie, StatutPaie } from './types.ts';

/** Mois de la paie en toutes lettres avec une majuscule : « Octobre 2026 » / « October 2026 ». */
export function formaterMois(mois: string, langue: string): string {
  const texte = new Intl.DateTimeFormat(langue, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${mois}-15T12:00:00Z`));
  return texte.charAt(0).toLocaleUpperCase(langue) + texte.slice(1);
}

/** Jours avant la paie : négatif, la paie est passée. */
export const joursAvantLaPaie = (aujourdhui: string, jourDePaie: string) =>
  joursEntre(aujourdhui, jourDePaie);

/** Nom du mois qui précède, en minuscules : « septembre » / « September ». */
export function moisPrecedent(mois: string, langue: string): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number];
  const precedent = new Date(Date.UTC(annee, numero - 2, 15, 12));
  return new Intl.DateTimeFormat(langue, { month: 'long', timeZone: 'UTC' }).format(precedent);
}

/** Couleur de la pastille d'état de l'état de paie (maquette : `PS`). */
export const niveauDuStatut = (statut: StatutPaie): NiveauStatut =>
  statut === 'brouillon'
    ? 'neutre'
    : statut === 'valide' || statut === 'payee'
      ? 'ok'
      : 'surveiller';

/** Texte du statut de l'état de paie, tel que la maquette l'écrit. */
export function libelleDuStatut(
  t: (cle: string, options?: Record<string, unknown>) => string,
  instantane: Pick<InstantanePaie, 'statut' | 'validePar'>,
): string {
  return t(`gestion.personnel.statuts.${instantane.statut}`, { nom: instantane.validePar });
}
