import { initI18n } from '@/i18n';
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from 'i18next';

import { uniteMatiere } from './affichage.ts';

beforeAll(async () => {
  await initI18n('fr').changeLanguage('fr');
});

// Sur le vrai serveur, l'écran compte dans l'unité du stock : farine en kg ; sel, levure et
// améliorant en g (la simulation garde les unités du prototype : farine en sacs, le reste en kg).
describe('unités des matières à l’écran (vrai serveur)', () => {
  it('farine en kg ; sel, levure et améliorant en g', () => {
    const t = i18n.t.bind(i18n);
    expect(uniteMatiere(t, 'farine')).toBe('kg');
    expect(uniteMatiere(t, 'sel')).toBe('g');
    expect(uniteMatiere(t, 'levure')).toBe('g');
    expect(uniteMatiere(t, 'ameliorant')).toBe('g');
  });

  it('glace, bois et huile gardent leurs unités', () => {
    const t = i18n.t.bind(i18n);
    expect(uniteMatiere(t, 'glace')).toBe('sachets');
    expect(uniteMatiere(t, 'bois')).toBe('chargements');
    expect(uniteMatiere(t, 'huile')).toBe('litres');
  });
});
