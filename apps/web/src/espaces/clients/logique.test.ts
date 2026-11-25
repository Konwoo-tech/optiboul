import { describe, expect, it } from 'vitest';

import type { ClientDeLecran } from './types.ts';
import { formaterJourCourt, formaterJourLong } from './formats.ts';
import {
  auDelaDuPlafond,
  compteursDeFiltres,
  enDette,
  filtrerClients,
  NIVEAU_DU_STATUT,
  peutRelancer,
  remplissageJauge,
  statutDeSolde,
  totalDesDettes,
} from './logique.ts';

const PLAFOND = 2000;
const client = (id: string, solde: number): ClientDeLecran => ({
  id,
  nom: id,
  type: 'livreur',
  lieu: 'Etoudi',
  telephone: '6 00 00 00 00',
  tarifs: { BAG: 100, KO: 70, GC: 160 },
  solde,
  relance: false,
});
const CLIENTS = [
  client('a-jour', 0),
  client('petit', -500),
  client('limite', -2000),
  client('depasse', -2350),
  client('gros', -4200),
];

describe('statutDeSolde', () => {
  it.each([
    [0, 'ajour'],
    [300, 'ajour'], // un solde positif (avance) n'est pas une dette
    [-1, 'dette'],
    [-1999, 'dette'],
    [-2000, 'dette'], // exactement au plafond : encore une dette, pas un dépassement
    [-2001, 'depasse'],
    [-4200, 'depasse'],
  ] as const)('solde %i : %s', (solde, statut) => {
    expect(statutDeSolde(solde, PLAFOND)).toBe(statut);
  });

  it('associe un niveau de couleur à chaque statut', () => {
    expect(NIVEAU_DU_STATUT).toEqual({ ajour: 'ok', dette: 'surveiller', depasse: 'bloquant' });
  });
});

describe('totaux', () => {
  it('compte les clients en dette et ceux au-delà du plafond', () => {
    expect(enDette(CLIENTS).map((c) => c.id)).toEqual(['petit', 'limite', 'depasse', 'gros']);
    expect(auDelaDuPlafond(CLIENTS, PLAFOND).map((c) => c.id)).toEqual(['depasse', 'gros']);
  });

  it('additionne les soldes négatifs en entiers, sans compter les avances', () => {
    expect(totalDesDettes([...CLIENTS, client('avance', 900)])).toBe(-9050);
    expect(totalDesDettes([])).toBe(0);
  });

  it('donne le nombre de clients de chaque filtre', () => {
    expect(compteursDeFiltres(CLIENTS, PLAFOND)).toEqual({ tous: 5, dette: 4, depasse: 2 });
  });
});

describe('filtrerClients', () => {
  it('« Tous » garde tout le monde, du plus endetté au moins endetté', () => {
    expect(filtrerClients(CLIENTS, 'tous', PLAFOND).map((c) => c.id)).toEqual([
      'gros',
      'depasse',
      'limite',
      'petit',
      'a-jour',
    ]);
  });

  it('« À régler avant dimanche » ne garde que les dettes', () => {
    expect(filtrerClients(CLIENTS, 'dette', PLAFOND).map((c) => c.id)).toEqual([
      'gros',
      'depasse',
      'limite',
      'petit',
    ]);
  });

  it('« Plafond dépassé » ne garde que les dettes au-delà du plafond', () => {
    expect(filtrerClients(CLIENTS, 'depasse', PLAFOND).map((c) => c.id)).toEqual([
      'gros',
      'depasse',
    ]);
  });

  it('ne modifie pas la liste reçue', () => {
    const copie = [...CLIENTS];
    filtrerClients(CLIENTS, 'tous', PLAFOND);
    expect(CLIENTS).toEqual(copie);
  });
});

describe('remplissageJauge', () => {
  it('vaut dette / plafond, de 0 à 100', () => {
    expect(remplissageJauge(0, PLAFOND)).toBe(0);
    expect(remplissageJauge(300, PLAFOND)).toBe(0);
    expect(remplissageJauge(-500, PLAFOND)).toBe(25);
    expect(remplissageJauge(-2000, PLAFOND)).toBe(100);
    expect(remplissageJauge(-4200, PLAFOND)).toBe(100);
  });

  it('est pleine sans plafond dès qu’il y a une dette', () => {
    expect(remplissageJauge(-1, 0)).toBe(100);
  });
});

describe('droits d’affichage', () => {
  it('seuls le gérant et le propriétaire relancent', () => {
    expect(peutRelancer('gerant')).toBe(true);
    expect(peutRelancer('proprietaire')).toBe(true);
    expect(peutRelancer('caissier')).toBe(false);
    expect(peutRelancer('production')).toBe(false);
    expect(peutRelancer('administrateur')).toBe(false);
    expect(peutRelancer(undefined)).toBe(false);
  });
});

describe('dates', () => {
  it('écrit les jours comme la maquette', () => {
    expect(formaterJourCourt('2026-10-14', 'fr')).toBe('14 oct.');
    expect(formaterJourCourt('2026-10-14', 'en')).toBe('Oct 14');
    expect(formaterJourLong('2026-10-18', 'fr')).toBe('dimanche 18 octobre');
    expect(formaterJourLong('2026-10-18', 'en')).toBe('Sunday, October 18');
  });
});
