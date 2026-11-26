import { describe, expect, it } from 'vitest';

import { definirCatalogue } from '../../comptoir/session/catalogue.ts';
import { libelleProduit } from './affichage.ts';
import {
  brouillonDuRealise,
  calculerDemande,
  calculerPlan,
  realiseSaisi,
  resteAProduire,
  supplementVide,
  totalSacs,
} from './regles.ts';
import { versRealise } from './reel.ts';

// Le plan de production suit le catalogue : un produit créé dans Paramètres y entre avec sa fiche.
describe('plan de production avec un produit de plus', () => {
  definirCatalogue([
    { code: 'BAG', fiche: { pains_par_sac: 315, poids_boule: 5000 } },
    { code: 'KO', fiche: { pains_par_sac: 426, poids_boule: 3700 } },
    { code: 'GC135', fiche: { pains_par_sac: 216, poids_boule: 7300 } },
    { code: 'PL', nom: 'Pain long', fiche: { pains_par_sac: 270, poids_boule: 4500 } },
  ]);

  it('calcule les sacs et les boules du nouveau produit avec sa fiche', () => {
    const plan = calculerPlan({ BAG: 315, KO: 0, GC: 0, PL: 271 }, { BAG: 0, KO: 0, GC: 0, PL: 1 });
    expect(plan.lignes.PL).toMatchObject({
      pains: 271,
      base: 2,
      supplement: 1,
      sacs: 3,
      prevus: 810,
    });
    // Pâte d'un sac 78 750 g, boules de 4 500 g.
    expect(plan.lignes.PL?.boules).toBe(52);
    expect(plan.sacs).toBe(1 + 3);
    expect(totalSacs({ BAG: 1, PL: 3 })).toBe(4);
  });

  it('estime la demande du nouveau produit sans guichet de démonstration', () => {
    const plan = calculerPlan({ BAG: 0, KO: 0, GC: 0, PL: 100 }, supplementVide());
    const demande = calculerDemande(plan, { BAG: 0, KO: 0, GC: 0, PL: 20 });
    expect(demande.PL).toMatchObject({ commande: 100, habituels: 20, guichet: 0, estimee: 120 });
    // 120 pains à faire, 270 prévus par le sac de base : rien à ajouter.
    expect(demande.PL?.besoin).toBe(0);
    expect(supplementVide()).toEqual({ BAG: 0, KO: 0, GC: 0, PL: 0 });
  });

  it('range le réalisé, le reste à produire et le brouillon pour tous les produits', () => {
    const realise = versRealise([
      { code: 'PL', realise: 0, prevus: 270 },
      { code: 'BAG', realise: 315, prevus: 315 },
      { code: 'AUTRE', realise: 5, prevus: 5 },
    ] as never);
    expect(realise).toEqual({ BAG: 315, KO: null, GC: null, PL: null });
    const plan = calculerPlan({ BAG: 315, KO: 0, GC: 0, PL: 270 }, supplementVide());
    expect(resteAProduire(plan, { BAG: 315, KO: null, GC: null, PL: 100 }).PL).toBe(170);
    expect(brouillonDuRealise({ BAG: 315, KO: null, GC: null, PL: 100 })).toEqual({
      BAG: '315',
      KO: '',
      GC: '',
      PL: '100',
    });
    expect(realiseSaisi({ BAG: '315', KO: '', GC: '', PL: '100' })).toEqual({
      BAG: 315,
      KO: null,
      GC: null,
      PL: 100,
    });
    expect(libelleProduit('PL')).toBe('PL');
    expect(libelleProduit('GC')).toBe('GC 135');
  });
});
