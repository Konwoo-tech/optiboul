import { describe, expect, it } from 'vitest';

import { calculerLivraison, planDeSacs, texteHabituel } from './calculs.ts';
import {
  CLES_PRODUIT,
  PRODUITS,
  cleDeCode,
  codeServeur,
  definirCatalogue,
  parProduit,
} from './catalogue.ts';
import { versQuantites, versSaisies } from './reel.ts';
import type { Client } from './types.ts';

// Un produit créé dans Paramètres doit se vendre au comptoir sans rien changer au code.
describe('catalogue du comptoir', () => {
  it('reprend les produits actifs du serveur dans leur ordre, avec « GC » pour le GC135', () => {
    definirCatalogue([
      { code: 'PL', actif: true, ordre: 4, fiche: { pains_par_sac: 270 } },
      { code: 'GC135', actif: true, ordre: 3, fiche: { pains_par_sac: 216 } },
      { code: 'BAG', actif: true, ordre: 1, fiche: { pains_par_sac: 315 } },
      { code: 'KO', actif: true, ordre: 2, fiche: null },
      { code: 'ANCIEN', actif: false, ordre: 0 },
    ]);
    expect(CLES_PRODUIT).toEqual(['BAG', 'KO', 'GC', 'PL']);
    expect(PRODUITS.map((p) => p.libelle)).toEqual(['BAG', 'KO', 'GC 135', 'PL']);
    expect(PRODUITS.find((p) => p.cle === 'PL')?.painsParSac).toBe(270);
    // Sans fiche, un produit d'origine garde son rendement connu.
    expect(PRODUITS.find((p) => p.cle === 'KO')?.painsParSac).toBe(426);
    expect(codeServeur('GC')).toBe('GC135');
    expect(cleDeCode('GC135')).toBe('GC');
    expect(codeServeur('PL')).toBe('PL');
    expect(parProduit(0)).toEqual({ BAG: 0, KO: 0, GC: 0, PL: 0 });
  });

  it('lit les quantités du serveur pour tout le catalogue et ignore un produit inconnu', () => {
    definirCatalogue([{ code: 'BAG' }, { code: 'PL' }]);
    expect(versQuantites({ BAG: 10, PL: 4, GC135: 2, AUTRE: 9 })).toEqual({ BAG: 10, PL: 4 });
    expect(versSaisies({ PL: 4 })).toEqual({ BAG: '', PL: '4' });
  });

  it('calcule la livraison, le plan de sacs et le texte de la commande avec le nouveau produit', () => {
    definirCatalogue([
      { code: 'BAG', fiche: { pains_par_sac: 315 } },
      { code: 'PL', fiche: { pains_par_sac: 270 } },
    ]);
    const client: Client = {
      id: 'a',
      nom: 'Alain',
      type: 'livreur',
      lieu: 'Etoudi',
      telephone: '',
      prix: { BAG: 100, PL: 200 },
      solde: 0,
    };
    const calcul = calculerLivraison({
      client,
      saisies: { BAG: '10', PL: '5' },
      recu: '2000',
      mode: 'especes',
      reference: '',
      paiementSeul: true,
      plafond: 2000,
      soldeAutorise: null,
      peutSaisir: true,
    });
    expect(calcul.lignes.map((l) => [l.cle, l.total])).toEqual([
      ['BAG', 1000],
      ['PL', 1000],
    ]);
    expect(calcul.du).toBe(2000);
    expect(calcul.valide).toBe(true);
    expect(planDeSacs([client], { a: { BAG: '315', PL: '271' } })).toEqual({
      BAG: { pains: 315, sacs: 1 },
      PL: { pains: 271, sacs: 2 },
    });
    expect(texteHabituel({ BAG: 12, PL: 3 })).toBe('12 BAG · 3 PL');
  });

  it('garde les produits actuels quand le serveur ne répond aucun produit', () => {
    definirCatalogue([{ code: 'BAG' }, { code: 'PL' }]);
    definirCatalogue([]);
    expect(CLES_PRODUIT).toEqual(['BAG', 'PL']);
  });
});
