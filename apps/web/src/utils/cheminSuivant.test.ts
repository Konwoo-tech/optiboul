import { describe, expect, it } from 'vitest';

import { cheminSuivant } from './cheminSuivant.ts';

describe('cheminSuivant', () => {
  it('accepte un chemin de l’application, avec sa recherche et son ancre', () => {
    expect(cheminSuivant('/comptoir')).toBe('/comptoir');
    expect(cheminSuivant('/gestion?semaine=42#ventes')).toBe('/gestion?semaine=42#ventes');
  });

  it.each([null, '', 'comptoir', 'https://exemple.test', '//exemple.test', '/\\exemple.test'])(
    'refuse %s',
    (valeur) => {
      expect(cheminSuivant(valeur)).toBeNull();
    },
  );
});
