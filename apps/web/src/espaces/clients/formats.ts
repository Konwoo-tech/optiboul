/** Jour sans heure (`2026-10-14`) lu comme une date de calendrier, sans décalage de fuseau. */
const enDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** « 14 oct. » en français, « Oct 14 » en anglais. */
export function formaterJourCourt(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(enDate(iso));
}

/** « dimanche 18 octobre » en français, « Sunday, October 18 » en anglais. */
export function formaterJourLong(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(enDate(iso));
}
