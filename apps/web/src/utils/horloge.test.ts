import { describe, expect, it } from 'vitest';

import { formaterDateCourte, formaterDateLongue, formaterHeure } from './horloge.ts';

// 14 octobre 2026, 17:02 UTC = 18:02 à Yaoundé (UTC+1).
const instant = new Date('2026-10-14T17:02:00Z');

describe('horloge', () => {
  it('écrit la date longue en français avec une majuscule', () => {
    expect(formaterDateLongue(instant, 'fr')).toBe('Mercredi 14 octobre 2026');
  });

  it('écrit la date longue en anglais', () => {
    expect(formaterDateLongue(instant, 'en')).toMatch(
      /^Wednesday,? (October 14|14 October),? 2026$/,
    );
  });

  it('écrit la date courte sans l’année', () => {
    expect(formaterDateCourte(instant, 'fr')).toBe('14 oct.');
  });

  it('affiche l’heure de Yaoundé sur 24 heures', () => {
    expect(formaterHeure(instant)).toBe('18:02');
  });

  it('passe minuit à Yaoundé et non à Greenwich', () => {
    expect(formaterHeure(new Date('2026-10-14T23:30:00Z'))).toBe('00:30');
  });
});
