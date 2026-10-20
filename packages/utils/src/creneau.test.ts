import { describe, expect, it } from 'vitest';

import { creneauDe } from './creneau.ts';

// Yaoundé est en UTC+1 toute l'année.
describe('creneauDe', () => {
  it('06:00 ouvre la session de jour', () => {
    expect(creneauDe(new Date('2026-10-19T05:00:00Z'))).toBe('jour');
  });

  it('18:00 ouvre la session de nuit', () => {
    expect(creneauDe(new Date('2026-10-19T17:00:00Z'))).toBe('nuit');
  });

  it('17:59 est encore le jour', () => {
    expect(creneauDe(new Date('2026-10-19T16:59:00Z'))).toBe('jour');
  });

  it('03:00 est encore la nuit', () => {
    expect(creneauDe(new Date('2026-10-19T02:00:00Z'))).toBe('nuit');
  });
});
