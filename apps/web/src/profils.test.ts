import { describe, expect, it } from 'vitest';

import { espacesDe, peutOuvrir, PROFILS } from './profils.ts';

describe('profils', () => {
  it("la caissière n'ouvre que le comptoir", () => {
    expect(espacesDe('caissier')).toEqual(['comptoir']);
    expect(peutOuvrir('caissier', 'gestion')).toBe(false);
  });

  it('chaque profil arrive sur un espace qu’il peut ouvrir', () => {
    for (const [profil, configuration] of Object.entries(PROFILS)) {
      const espace = configuration.accueil.slice(1) as (typeof configuration.espaces)[number];
      expect(peutOuvrir(profil as keyof typeof PROFILS, espace)).toBe(true);
    }
  });

  it('sans profil, aucun espace', () => {
    expect(espacesDe(null)).toEqual([]);
  });
});
