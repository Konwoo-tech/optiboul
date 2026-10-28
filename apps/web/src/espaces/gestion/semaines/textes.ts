import type { TFunction } from 'i18next';

import { jourMois } from './affichage.ts';
import type { Semaine } from './types.ts';

/** « Semaine 42 · 12 oct. → 18 oct. » (français) ou « Week 42 · Oct 12 → Oct 18 » (anglais). */
export function libelleSemaine(t: TFunction, semaine: Semaine, langue: string): string {
  return t('gestion.semaines.libelle', {
    numero: semaine.numero,
    du: jourMois(semaine.du, langue),
    au: jourMois(semaine.au, langue),
  });
}
