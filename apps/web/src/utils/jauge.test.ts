import { describe, expect, it } from 'vitest';

import { niveauDeRatio } from './jauge.ts';

describe('niveauDeRatio', () => {
  it('reste « ok » sous 85 %', () => {
    expect(niveauDeRatio(0, 2000)).toBe('ok');
    expect(niveauDeRatio(1699, 2000)).toBe('ok');
  });

  it('passe « à surveiller » à partir de 85 %', () => {
    expect(niveauDeRatio(1700, 2000)).toBe('surveiller');
    expect(niveauDeRatio(1999, 2000)).toBe('surveiller');
  });

  it('devient « bloquant » à 100 % et au-delà', () => {
    expect(niveauDeRatio(2000, 2000)).toBe('bloquant');
    expect(niveauDeRatio(3500, 2000)).toBe('bloquant');
  });

  it('traite un maximum nul sans diviser par zéro', () => {
    expect(niveauDeRatio(0, 0)).toBe('ok');
    expect(niveauDeRatio(10, 0)).toBe('bloquant');
  });
});
