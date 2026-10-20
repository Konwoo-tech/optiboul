export type Creneau = 'jour' | 'nuit';

export const FUSEAU_BOULANGERIE = 'Africa/Douala';

const heureDouala = new Intl.DateTimeFormat('fr-FR', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: FUSEAU_BOULANGERIE,
});

/** Session de jour 06:00–18:00, session de nuit 18:00–06:00 (heure de Yaoundé). */
export function creneauDe(date: Date): Creneau {
  // formatToParts : en français, format() renvoie « 06 h » et non « 06 ».
  const heure = Number(heureDouala.formatToParts(date).find((p) => p.type === 'hour')?.value);
  return heure >= 6 && heure < 18 ? 'jour' : 'nuit';
}
