const MOIS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const JOURS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const JOURS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** « AAAA-MM-JJ » lu comme une date du calendrier, sans fuseau (midi UTC). */
function lire(jour: string): { semaine: number; jour: number; mois: number } {
  const date = new Date(`${jour}T12:00:00Z`);
  return { semaine: date.getUTCDay(), jour: date.getUTCDate(), mois: date.getUTCMonth() };
}

/** « 15 oct. » / « Oct 15 », comme la maquette (le premier du mois est « 1er » en français). */
export function jourCourt(jour: string, langue: string): string {
  const { jour: j, mois } = lire(jour);
  if (langue === 'en') return `${MOIS_EN[mois]} ${j}`;
  return `${j === 1 ? '1er' : j} ${MOIS_FR[mois]}`;
}

/** « lun. 12 oct. » / « Mon Oct 12 », avec le jour de la semaine. */
export function jourAvecSemaine(jour: string, langue: string): string {
  const { semaine } = lire(jour);
  const nom = langue === 'en' ? JOURS_EN[semaine] : JOURS_FR[semaine];
  return `${nom} ${jourCourt(jour, langue)}`;
}
