import { describe, expect, it } from 'vitest';

import { formaterNombre, formatFCFA } from './fcfa.ts';

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

describe('formaterNombre', () => {
  it('sépare les milliers par une espace insécable, comme la maquette', () => {
    expect(formaterNombre(14050)).toBe('14 050');
    expect(formaterNombre(-1250)).toBe('−1 250');
    expect(formaterNombre(0)).toBe('0');
    expect(formaterNombre(999)).toBe('999');
  });
});
