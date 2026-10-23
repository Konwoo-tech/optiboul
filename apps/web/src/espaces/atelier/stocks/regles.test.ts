import { describe, expect, it } from 'vitest';

import {
  comptageSaisi,
  controleDuJour,
  droitsStocks,
  ecartDepasseLaTolerance,
  ecartPourcent,
  erreurDeMouvement,
  filtrerMouvements,
  joursDuSelecteur,
  ligneHorsTolerance,
  niveauDuStock,
  quantiteSaisie,
  sessionsAffichees,
  statutControle,
  stockADate,
} from './regles.ts';
import type { FicheMatiere, Inventaire, Mouvement } from './types.ts';

const fiche = (stock: number): FicheMatiere => ({ cle: 'farine', stock, besoin: 6, prix: 100 });

const mouvement = (extra: Partial<Mouvement>): Mouvement => ({
  id: 'm',
  jour: '2026-10-14',
  heure: '10:00',
  type: 'sortie',
  matiere: 'farine',
  quantite: 6,
  origine: { genre: 'manuel', motif: 'test' },
  par: 'Willy',
  ...extra,
});

const inventaire = (extra: Partial<Inventaire> = {}): Inventaire => ({
  id: 'AUD-01',
  numero: 1,
  jour: '2026-10-11',
  heure: '21:00',
  par: 'Patrick',
  statut: 'valide',
  validePar: 'Patrick',
  lignes: [{ matiere: 'farine', theorique: 12, compte: 12 }],
  ...extra,
});

describe('droits du stock', () => {
  it('le gérant et le chef saisissent, le propriétaire consulte, les autres ne voient rien', () => {
    expect(droitsStocks('gerant')).toEqual({ voir: true, modifier: true });
    expect(droitsStocks('production')).toEqual({ voir: true, modifier: true });
    expect(droitsStocks('proprietaire')).toEqual({ voir: true, modifier: false });
    expect(droitsStocks('caissier')).toEqual({ voir: false, modifier: false });
    expect(droitsStocks('administrateur')).toEqual({ voir: false, modifier: false });
    expect(droitsStocks(undefined)).toEqual({ voir: false, modifier: false });
  });
});

describe('statut du stock', () => {
  it('moins d’une session : stock bas ; moins de deux : à commander ; sinon suffisant', () => {
    expect(niveauDuStock(5.9, 6)).toBe('bas');
    expect(niveauDuStock(6, 6)).toBe('a-commander');
    expect(niveauDuStock(11.9, 6)).toBe('a-commander');
    expect(niveauDuStock(12, 6)).toBe('suffisant');
  });

  it('une matière sans besoin est toujours suffisante (99 sessions)', () => {
    expect(niveauDuStock(0, 0)).toBe('suffisant');
    expect(sessionsAffichees(0, 0)).toBe(99);
  });

  it('tronque les sessions au dixième', () => {
    expect(sessionsAffichees(20, 3)).toBe(6.6);
    expect(sessionsAffichees(30, 6)).toBe(5);
  });
});

describe('inventaire : tolérance de 5 %', () => {
  it('5 % pile reste ajusté, au-delà part au propriétaire', () => {
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 100, compte: 95 }])).toBe(
      false,
    );
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 100, compte: 105 }])).toBe(
      false,
    );
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 100, compte: 94 }])).toBe(true);
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 100, compte: 106 }])).toBe(
      true,
    );
  });

  it('un théorique nul avec un comptage positif est un écart ; avec zéro compté, non', () => {
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 0, compte: 3 }])).toBe(true);
    expect(ecartDepasseLaTolerance([{ matiere: 'farine', theorique: 0, compte: 0 }])).toBe(false);
    expect(ecartPourcent(0, 3)).toBe(0);
  });

  it('la frontière est exacte : 5 % pile dans la tolérance, un cheveu au-delà hors tolérance', () => {
    expect(ligneHorsTolerance({ theorique: 30, compte: 28.5 })).toBe(false);
    expect(ligneHorsTolerance({ theorique: 30, compte: 31.5 })).toBe(false);
    expect(ligneHorsTolerance({ theorique: 30, compte: 28.49 })).toBe(true);
    expect(ligneHorsTolerance({ theorique: 30, compte: 31.51 })).toBe(true);
  });

  it('une seule matière hors tolérance suffit', () => {
    expect(
      ecartDepasseLaTolerance([
        { matiere: 'farine', theorique: 100, compte: 100 },
        { matiere: 'sel', theorique: 10, compte: 8 },
      ]),
    ).toBe(true);
  });
});

describe('saisies', () => {
  it('quantité : virgule ou point, jamais zéro ni négatif', () => {
    expect(quantiteSaisie('2,5')).toBe(2.5);
    expect(quantiteSaisie('2.5')).toBe(2.5);
    expect(quantiteSaisie('0')).toBe(0);
    expect(quantiteSaisie('-3')).toBe(0);
    expect(quantiteSaisie('')).toBe(0);
  });

  it('comptage : zéro est un comptage valable, vide ne l’est pas', () => {
    expect(comptageSaisi('0')).toBe(0);
    expect(comptageSaisi('')).toBeNull();
    expect(comptageSaisi('  ')).toBeNull();
    expect(comptageSaisi('14,4')).toBe(14.4);
  });

  it('mouvement manuel : la quantité d’abord, puis le motif obligatoire', () => {
    expect(erreurDeMouvement('', '')).toBe('quantite');
    expect(erreurDeMouvement('2', '   ')).toBe('motif');
    expect(erreurDeMouvement('2', 'Casse')).toBeNull();
  });

  it('filtre les mouvements par type', () => {
    const tous = [mouvement({ id: 'a', type: 'entree' }), mouvement({ id: 'b', type: 'perte' })];
    expect(filtrerMouvements(tous, 'all')).toHaveLength(2);
    expect(filtrerMouvements(tous, 'perte').map((m) => m.id)).toEqual(['b']);
    expect(filtrerMouvements(tous, 'ajustement')).toEqual([]);
  });
});

describe('stock à date', () => {
  const mouvements = [
    mouvement({ id: 'a', jour: '2026-10-14', type: 'sortie', quantite: 6 }),
    mouvement({ id: 'b', jour: '2026-10-13', type: 'entree', quantite: 44 }),
    mouvement({ id: 'c', jour: '2026-10-11', type: 'sortie', quantite: 2 }),
  ];

  it('les huit jours finissent par aujourd’hui', () => {
    const jours = joursDuSelecteur('2026-10-14');
    expect(jours).toHaveLength(8);
    expect(jours[0]).toBe('2026-10-07');
    expect(jours[7]).toBe('2026-10-14');
  });

  it('aujourd’hui : le stock actuel', () => {
    const { lignes } = stockADate([fiche(30)], mouvements, [], '2026-10-14', '2026-10-14');
    expect(lignes[0]).toMatchObject({ fin: 30, sorties: 6 });
  });

  it('sans inventaire : le stock actuel moins les mouvements postérieurs', () => {
    const { lignes, valeur } = stockADate([fiche(30)], mouvements, [], '2026-10-12', '2026-10-14');
    // 30 − (−6) − 44 = −8 → jamais négatif
    expect(lignes[0]!.fin).toBe(0);
    expect(valeur).toBe(0);
    const veille = stockADate([fiche(30)], mouvements, [], '2026-10-13', '2026-10-14');
    expect(veille.lignes[0]!.fin).toBe(36);
    expect(veille.lignes[0]).toMatchObject({ entrees: 44 });
  });

  it('à partir du dernier inventaire validé, plus les mouvements depuis', () => {
    const { lignes } = stockADate(
      [fiche(30)],
      mouvements,
      [inventaire()],
      '2026-10-13',
      '2026-10-14',
    );
    expect(lignes[0]!.fin).toBe(56);
    expect(lignes[0]!.controle?.compte).toBe(12);
  });

  it('un inventaire à valider ou refusé ne sert pas de base', () => {
    const enAttente = inventaire({ statut: 'a-valider' });
    const { lignes } = stockADate([fiche(30)], mouvements, [enAttente], '2026-10-13', '2026-10-14');
    expect(lignes[0]!.fin).toBe(36);
    // …mais il reste le dernier comptage physique affiché
    expect(lignes[0]!.controle?.inventaire.id).toBe('AUD-01');
  });

  it('les ajustements de l’inventaire de base ne sont pas comptés deux fois', () => {
    const ajustement = mouvement({
      id: 'x',
      jour: '2026-10-12',
      type: 'ajustement',
      quantite: -1,
      origine: { genre: 'inventaire', code: 'AUD-01', date: '2026-10-11' },
    });
    const { lignes } = stockADate(
      [fiche(30)],
      [ajustement],
      [inventaire()],
      '2026-10-13',
      '2026-10-14',
    );
    expect(lignes[0]!.fin).toBe(12);
  });
});

describe('contrôles du mercredi et du dimanche', () => {
  it('passé sans inventaire : manqué ; aujourd’hui : à faire ; plus tard : prévu', () => {
    expect(statutControle('2026-10-07', '2026-10-14', undefined)).toBe('manque');
    expect(statutControle('2026-10-14', '2026-10-14', undefined)).toBe('aujourdhui');
    expect(statutControle('2026-10-18', '2026-10-14', undefined)).toBe('prevu');
  });

  it('un inventaire fait le contrôle, selon son statut', () => {
    expect(statutControle('2026-10-11', '2026-10-14', inventaire())).toBe('fait');
    expect(statutControle('2026-10-11', '2026-10-14', inventaire({ statut: 'a-valider' }))).toBe(
      'a-valider',
    );
    expect(statutControle('2026-10-11', '2026-10-14', inventaire({ statut: 'refuse' }))).toBe(
      'refuse',
    );
  });

  it('le contrôle du jour n’est plus à faire une fois compté', () => {
    const controles = [
      {
        semaine: 42,
        jour: '2026-10-14',
        moment: 'mercredi',
        gerant: 'Willy',
        responsableProduction: 'Serge',
      },
    ] as const;
    expect(controleDuJour(controles, [], '2026-10-14')).toBeDefined();
    expect(
      controleDuJour(controles, [inventaire({ jour: '2026-10-14' })], '2026-10-14'),
    ).toBeUndefined();
    expect(controleDuJour(controles, [], '2026-10-15')).toBeUndefined();
  });
});
