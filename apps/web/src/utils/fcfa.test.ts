import { describe, expect, it } from 'vitest';

import { formatFCFA } from './fcfa.ts';

const normaliser = (texte: string) => texte.replace(/[  ]/g, ' ');

describe('formatFCFA', () => {
  it('sépare les milliers sans décimale', () => {
    expect(normaliser(formatFCFA(9786075))).toBe('9 786 075 FCFA');
  });

  it('affiche un signe moins explicite', () => {
    expect(normaliser(formatFCFA(-1500))).toBe('−1 500 FCFA');
  });

  it('arrondit au franc', () => {
    expect(normaliser(formatFCFA(19525.4))).toBe('19 525 FCFA');
  });
});
