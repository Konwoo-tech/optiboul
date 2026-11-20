import { describe, expect, it } from 'vitest';

import { COULEURS, COULEURS_FIXES, PALETTE, STATUTS } from './couleurs.ts';

// Critère d'US-004 : contraste AA (WCAG 2.1) vérifié. Texte courant : 4,5 ; grand texte : 3.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

describe.each(['clair', 'sombre'] as const)('contraste AA, thème %s', (schema) => {
  const p = PALETTE[schema];
  it.each([
    ['texte sur le fond', p.encre, p.fond],
    ['texte sur les cartes', p.encre, p.surface],
    ['texte sur les champs', p.encre, p.champ],
    ['texte discret sur le fond', p.discret, p.fond],
    ['texte discret sur les cartes', p.discret, p.surface],
    ['texte discret sur les zones douces', p.discret, p.doux],
  ])('%s ≥ 4,5', (_nom, texte, fond) => {
    expect(contraste(texte, fond)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(STATUTS[schema]))('pastille « %s » ≥ 4,5', (_niveau, c) => {
    expect(contraste(c.texte, c.fond)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste AA, éléments propres à la marque', () => {
  it('menu : texte crème sur la barre chocolat (clair) et sombre', () => {
    expect(contraste(COULEURS.creme, PALETTE.clair.barre)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(PALETTE.sombre.marque, PALETTE.sombre.barre)).toBeGreaterThanOrEqual(4.5);
  });
  it('boutons or : texte chocolat foncé sur l’or', () => {
    expect(contraste(PALETTE.clair.encre, COULEURS.or)).toBeGreaterThanOrEqual(4.5);
  });
  it('message d’erreur sur les cartes (thème clair)', () => {
    expect(contraste(COULEURS_FIXES.erreurTexte, PALETTE.clair.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
