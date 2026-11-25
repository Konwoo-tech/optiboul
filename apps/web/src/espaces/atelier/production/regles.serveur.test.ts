import { describe, expect, it } from 'vitest';

import { sortiesDeStock } from './regles.ts';
import type { Consommation } from './types.ts';

// Le stock du serveur se compte dans l'unité de la consommation :
// farine en kg ; sel, levure et améliorant en g. Aucune conversion à l'affichage.
describe('sorties de stock', () => {
  const consommation: Consommation = {
    farine: 150,
    sel: 1800,
    levure: 1350,
    ameliorant: 900,
    glace: 15,
    bois: 1,
    huile: 3,
  };

  it('reprend la consommation telle quelle, dans l’unité du serveur', () => {
    expect(sortiesDeStock(consommation)).toEqual([
      { matiere: 'farine', quantite: 150 },
      { matiere: 'sel', quantite: 1800 },
      { matiere: 'levure', quantite: 1350 },
      { matiere: 'ameliorant', quantite: 900 },
      { matiere: 'glace', quantite: 15 },
      { matiere: 'bois', quantite: 1 },
      { matiere: 'huile', quantite: 3 },
    ]);
  });
});
