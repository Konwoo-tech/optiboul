import { describe, expect, it } from 'vitest';

import { initiales } from './initiales.ts';

describe('initiales', () => {
  it('prend une seule lettre pour un prénom seul', () => {
    expect(initiales('Davy')).toBe('D');
  });

  it('prend la première lettre de chaque mot, deux au plus, sans les points', () => {
    expect(initiales('M. Fotso')).toBe('MF');
    expect(initiales('Support OptiBoul')).toBe('SO');
    expect(initiales('Jean Pierre Mbarga')).toBe('JP');
  });

  it('ignore les espaces en trop et renvoie vide si le nom est vide', () => {
    expect(initiales('  Rachel  ')).toBe('R');
    expect(initiales('   ')).toBe('');
  });
});
