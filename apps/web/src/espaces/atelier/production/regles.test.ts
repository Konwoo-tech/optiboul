import { describe, expect, it } from 'vitest';

import {
  actionDuCycle,
  calculerDemande,
  calculerFiche,
  calculerPlan,
  champInvalide,
  decimal,
  droitsProduction,
  ecartAJustifier,
  ecartEnKg,
  etatsDesEtapes,
  limiteEcartKg,
  motDEcart,
  peutSaisir,
  resteAProduire,
  supplementEnDemande,
  supplementPossible,
  supplementVide,
} from './regles.ts';
import type { Consommation } from './types.ts';

const EQUIPE = { responsable: 'Serge', gerant: 'Willy' };
const PAINS = { BAG: 750, KO: 460, GC: 140 };

describe('plan de production', () => {
  it('arrondit au sac supérieur et reprend le plan de la maquette (6 sacs, 2 013 pains)', () => {
    const plan = calculerPlan(PAINS, supplementVide());
    expect(plan.lignes.BAG).toMatchObject({ base: 3, sacs: 3, prevus: 945, boules: 47 });
    expect(plan.lignes.KO).toMatchObject({ sacs: 2, prevus: 852 });
    expect(plan.lignes.GC).toMatchObject({ sacs: 1, prevus: 216 });
    expect(plan.sacs).toBe(6);
    expect(plan.prevus).toBe(2013);
  });

  it('ajoute le supplément aux sacs', () => {
    const plan = calculerPlan(PAINS, { BAG: 1, KO: 0, GC: 2 });
    expect(plan.lignes.BAG.sacs).toBe(4);
    expect(plan.lignes.GC.sacs).toBe(3);
    expect(plan.supplement).toBe(3);
  });

  it('suggère un sac de baguette quand la demande estimée dépasse le plan, jamais un nombre négatif', () => {
    const plan = calculerPlan(PAINS, supplementVide());
    const demande = calculerDemande(plan, { BAG: 220, KO: 160, GC: 50 });
    expect(demande.BAG).toMatchObject({ estimee: 1090, besoin: 1 });
    expect(demande.KO.besoin).toBe(0);
    expect(demande.GC.besoin).toBe(0);
  });

  it('calcule le reste à produire sans descendre sous zéro', () => {
    const plan = calculerPlan(PAINS, supplementVide());
    expect(resteAProduire(plan, { BAG: 900, KO: null, GC: 300 })).toEqual({
      BAG: 45,
      KO: 852,
      GC: 0,
    });
  });
});

describe('écarts', () => {
  it('classe l’écart en pourcentage aux seuils 5 % et 15 % (bornes incluses)', () => {
    expect(motDEcart(5)).toBe('ok');
    expect(motDEcart(-5)).toBe('ok');
    expect(motDEcart(5.1)).toBe('surveiller');
    expect(motDEcart(15)).toBe('surveiller');
    expect(motDEcart(15.1)).toBe('bloquant');
  });

  const juste: Consommation = {
    farine: 300,
    sel: 3600,
    levure: 2700,
    ameliorant: 1800,
    glace: 30,
    bois: 1,
    huile: 3,
  };

  it('additionne l’écart des matières pesées en kg', () => {
    expect(ecartEnKg(juste, 6)).toBe(0);
    expect(ecartEnKg({ ...juste, farine: 320, sel: 4600 }, 6)).toBeCloseTo(21, 5);
  });

  it('exige une justification au-delà de 2 kg par sac, dans les deux sens, seuil exclu', () => {
    const limite = limiteEcartKg(2, 6);
    expect(limite).toBe(12);
    expect(ecartAJustifier(12, limite)).toBe(false);
    expect(ecartAJustifier(12.1, limite)).toBe(true);
    expect(ecartAJustifier(-12.1, limite)).toBe(true);
  });
});

describe('droits et cycle', () => {
  it('seul le responsable de la semaine agit sur le cycle, le gérant de la semaine valide', () => {
    const serge = droitsProduction('production', 'Serge', EQUIPE);
    const ignace = droitsProduction('production', 'Ignace', EQUIPE);
    const willy = droitsProduction('gerant', 'Willy', EQUIPE);
    const patrick = droitsProduction('gerant', 'Patrick', EQUIPE);
    const fotso = droitsProduction('proprietaire', 'M. Fotso', EQUIPE);
    expect(actionDuCycle('commandes', serge)).toBe('proposer');
    expect(actionDuCycle('commandes', ignace)).toBeNull();
    expect(actionDuCycle('plan-propose', willy)).toBe('valider');
    expect(actionDuCycle('plan-propose', patrick)).toBeNull();
    expect(actionDuCycle('plan-propose', fotso)).toBe('valider');
    expect(actionDuCycle('plan-valide', serge)).toBe('ouvrir');
    expect(actionDuCycle('en-cours', serge)).toBe('cloturer');
    expect(actionDuCycle('cloturee', serge)).toBeNull();
  });

  it('refuse l’écran à la caissière et à l’administrateur, les fiches au seul propriétaire ou admin', () => {
    expect(droitsProduction('caissier', 'Davy', EQUIPE).voir).toBe(false);
    expect(droitsProduction('administrateur', 'Support', EQUIPE).voir).toBe(false);
    expect(droitsProduction('gerant', 'Willy', EQUIPE).modifierFiches).toBe(false);
    expect(droitsProduction('proprietaire', 'M. Fotso', EQUIPE).modifierFiches).toBe(true);
  });

  it('la saisie n’est ouverte qu’en cours de production, au responsable', () => {
    const serge = droitsProduction('production', 'Serge', EQUIPE);
    expect(peutSaisir('en-cours', serge)).toBe(true);
    expect(peutSaisir('plan-valide', serge)).toBe(false);
    expect(peutSaisir('cloturee', serge)).toBe(false);
    expect(peutSaisir('en-cours', droitsProduction('gerant', 'Willy', EQUIPE))).toBe(false);
  });

  it('un supplément s’ajoute avant la validation, devient une demande après (R15)', () => {
    expect(supplementEnDemande('commandes')).toBe(false);
    expect(supplementEnDemande('plan-propose')).toBe(false);
    expect(supplementEnDemande('plan-valide')).toBe(true);
    expect(supplementEnDemande('en-cours')).toBe(true);
    const serge = droitsProduction('production', 'Serge', EQUIPE);
    expect(supplementPossible('en-cours', serge, false)).toBe(true);
    expect(supplementPossible('en-cours', serge, true)).toBe(false);
    expect(supplementPossible('cloturee', serge, false)).toBe(false);
  });

  it('marque les étapes faites et l’étape courante', () => {
    expect(etatsDesEtapes('commandes')).toEqual([
      'courante',
      'a-venir',
      'a-venir',
      'a-venir',
      'a-venir',
    ]);
    expect(etatsDesEtapes('plan-propose')).toEqual([
      'faite',
      'faite',
      'courante',
      'a-venir',
      'a-venir',
    ]);
    expect(etatsDesEtapes('cloturee')).toEqual(['faite', 'faite', 'faite', 'faite', 'faite']);
  });
});

describe('fiche technique', () => {
  const prix = {
    farine: 19525,
    sel: 300,
    levure: 5000,
    ameliorant: 4000,
    glace: 1000,
    bois: 20000,
    huile: 1500,
  };
  const recette = {
    boule: 5000,
    pb: 20,
    farine: 50,
    eau: 27.4,
    sel: 0.6,
    levure: 0.45,
    ameliorant: 0.3,
    glace: 5,
  };

  it('retrouve 315 baguettes par sac et un coût d’environ 99 FCFA', () => {
    const calcul = calculerFiche(recette, prix, [100, 110]);
    expect(calcul.painsParSac).toBe(315);
    expect(calcul.coutDuSac).toBeCloseTo(31217.5, 1);
    expect(calcul.coutParPain).toBeCloseTo(99.1, 1);
    expect(calcul.marges?.[0]).toBeCloseTo(0.9, 1);
  });

  it('sans prix relevé, pas de marge', () => {
    expect(calculerFiche(recette, prix, null).marges).toBeNull();
  });

  it('exige des quantités strictement positives, sauf l’eau et la glace', () => {
    expect(champInvalide({ ...recette, eau: 0, glace: 0 })).toBeUndefined();
    expect(champInvalide({ ...recette, sel: 0 })).toBe('sel');
  });

  it('formate les décimales selon la langue', () => {
    expect(decimal(1234.56, 1, 'fr')).toBe('1 234,6');
    expect(decimal(1234.56, 1, 'en')).toBe('1 234.6');
  });
});
