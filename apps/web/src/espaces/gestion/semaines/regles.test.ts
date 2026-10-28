import { describe, expect, it } from 'vitest';

import {
  aDesBloquants,
  creneauxAffectes,
  droitsSemaines,
  joursDeLaSemaine,
  niveauDeLEcart,
  noteCloture,
  peutAffecter,
  peutCloturer,
  peutOuvrir,
  peutPlanifier,
  raisonOuverture,
  semaineCourante,
} from './regles.ts';
import type { Controle, Personne, Semaine } from './types.ts';

const personne = (id: string, profil: Personne['profil']): Personne => ({
  id,
  nom: id[0]!.toUpperCase() + id.slice(1),
  profil,
});
const willy = personne('willy', 'gerant');
const patrick = personne('patrick', 'gerant');
const serge = personne('serge', 'production');

const semaine = (
  numero: number,
  statut: Semaine['statut'],
  extra: Partial<Semaine> = {},
): Semaine => ({
  id: `S${numero}`,
  numero,
  du: '2026-10-12',
  au: '2026-10-18',
  statut,
  gerant: willy,
  production: serge,
  planifieePar: 'M. Fotso',
  ouverture: null,
  cloture: null,
  ...extra,
});

const bloquant: Controle = { cle: 'caisse', niveau: 'bloquant' };
const vert: Controle = { cle: 'production', niveau: 'ok', responsable: 'Serge' };

describe('droits', () => {
  it('le gérant, le propriétaire et le responsable de production voient les semaines', () => {
    expect(droitsSemaines('gerant').voir).toBe(true);
    expect(droitsSemaines('proprietaire').voir).toBe(true);
    expect(droitsSemaines('production').voir).toBe(true);
    expect(droitsSemaines('caissier').voir).toBe(false);
    expect(droitsSemaines('administrateur').voir).toBe(false);
    expect(droitsSemaines(null).voir).toBe(false);
  });

  it('seul le propriétaire affecte, et seulement une semaine planifiée', () => {
    expect(peutAffecter('proprietaire', semaine(43, 'planifiee'))).toBe(true);
    expect(peutAffecter('proprietaire', semaine(42, 'ouverte'))).toBe(false);
    expect(peutAffecter('gerant', semaine(43, 'planifiee'))).toBe(false);
  });

  it('le planning est au propriétaire et au gérant de la semaine, jamais après la clôture', () => {
    expect(peutPlanifier('proprietaire', semaine(42, 'ouverte'), 'M. Fotso')).toBe(true);
    expect(peutPlanifier('gerant', semaine(42, 'ouverte'), 'Willy')).toBe(true);
    expect(peutPlanifier('gerant', semaine(42, 'ouverte'), 'Patrick')).toBe(false);
    expect(peutPlanifier('production', semaine(42, 'ouverte'), 'Serge')).toBe(false);
    expect(peutPlanifier('proprietaire', semaine(41, 'cloturee'), 'M. Fotso')).toBe(false);
  });
});

describe('ouverture (R2, §5.1)', () => {
  const s41 = semaine(41, 'cloturee');
  const s42 = semaine(42, 'ouverte');
  const s43 = semaine(43, 'planifiee', { gerant: patrick });

  it('exige un gérant et un responsable affectés', () => {
    const sans = semaine(44, 'planifiee', { gerant: null });
    expect(raisonOuverture(sans, [s41, s42, s43, sans], 'proprietaire', 'M. Fotso')).toEqual({
      cle: 'affecter',
    });
  });

  it('une seule semaine ouverte à la fois', () => {
    expect(raisonOuverture(s43, [s41, s42, s43], 'proprietaire', 'M. Fotso')).toEqual({
      cle: 'autreOuverte',
      numero: 42,
    });
  });

  it('la semaine précédente doit être clôturée', () => {
    const planifiee = semaine(42, 'planifiee');
    expect(raisonOuverture(s43, [s41, planifiee, s43], 'proprietaire', 'M. Fotso')).toEqual({
      cle: 'precedente',
    });
  });

  it('le propriétaire ou le gérant affecté ouvre, les autres non', () => {
    const liste = [s41, semaine(42, 'cloturee'), s43];
    expect(raisonOuverture(s43, liste, 'proprietaire', 'M. Fotso')).toBeNull();
    expect(raisonOuverture(s43, liste, 'gerant', 'Patrick')).toBeNull();
    expect(raisonOuverture(s43, liste, 'gerant', 'Willy')).toEqual({ cle: 'droit' });
    expect(raisonOuverture(s43, liste, 'production', 'Serge')).toEqual({ cle: 'droit' });
    expect(peutOuvrir(s43, liste, 'gerant', 'Patrick')).toBe(true);
    expect(peutOuvrir(s43, liste, 'gerant', 'Willy')).toBe(false);
  });

  it('une semaine déjà ouverte ou clôturée n’a rien à ouvrir', () => {
    expect(raisonOuverture(s42, [s41, s42], 'proprietaire', 'M. Fotso')).toBeNull();
    expect(peutOuvrir(s42, [s41, s42], 'proprietaire', 'M. Fotso')).toBe(false);
  });
});

describe('clôture (R3)', () => {
  const ouverte = semaine(42, 'ouverte');

  it('un contrôle bloquant interdit la clôture', () => {
    expect(aDesBloquants([vert, bloquant])).toBe(true);
    expect(peutCloturer('proprietaire', ouverte, 'M. Fotso', [bloquant])).toBe(false);
    expect(noteCloture('gerant', ouverte, 'Willy', [bloquant])).toBe('bloquants');
  });

  it('les contrôles « à voir » ne bloquent pas', () => {
    const avoir: Controle = { cle: 'dettes', niveau: 'surveiller', clients: 8, montant: 14_050 };
    expect(aDesBloquants([vert, avoir])).toBe(false);
    expect(peutCloturer('gerant', ouverte, 'Willy', [vert, avoir])).toBe(true);
  });

  it('le gérant de la semaine ou le propriétaire clôture', () => {
    expect(peutCloturer('gerant', ouverte, 'Willy', [vert])).toBe(true);
    expect(peutCloturer('proprietaire', ouverte, 'M. Fotso', [vert])).toBe(true);
    expect(peutCloturer('gerant', ouverte, 'Patrick', [vert])).toBe(false);
    expect(peutCloturer('production', ouverte, 'Serge', [vert])).toBe(false);
    expect(noteCloture('gerant', ouverte, 'Patrick', [vert])).toBe('droit');
    expect(noteCloture('gerant', ouverte, 'Willy', [vert])).toBe('prevue');
  });

  it('seule une semaine ouverte se clôture', () => {
    expect(peutCloturer('proprietaire', semaine(43, 'planifiee'), 'M. Fotso', [vert])).toBe(false);
    expect(peutCloturer('proprietaire', semaine(41, 'cloturee'), 'M. Fotso', [vert])).toBe(false);
  });
});

describe('calendrier et planning', () => {
  it('donne les sept jours, du lundi au dimanche, y compris à cheval sur deux mois', () => {
    expect(joursDeLaSemaine('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('compte les créneaux affectés', () => {
    const planning = {
      S42: {
        '2026-10-12': { jour: 'rachel', nuit: 'davy' },
        '2026-10-13': { jour: 'rachel', nuit: '' },
      },
    };
    expect(creneauxAffectes(semaine(42, 'ouverte'), planning)).toBe(3);
    expect(creneauxAffectes(semaine(43, 'planifiee'), planning)).toBe(0);
  });

  it('la semaine courante est l’ouverte, sinon la dernière clôturée, sinon la première', () => {
    const [a, b, c] = [semaine(41, 'cloturee'), semaine(42, 'ouverte'), semaine(43, 'planifiee')];
    expect(semaineCourante([a!, b!, c!])).toBe(b);
    expect(semaineCourante([a!, semaine(42, 'cloturee'), c!])?.numero).toBe(42);
    expect(semaineCourante([c!])).toBe(c);
  });

  it('l’écart de caisse : juste, manquant, en trop', () => {
    expect(niveauDeLEcart(0)).toBe('ok');
    expect(niveauDeLEcart(-500)).toBe('bloquant');
    expect(niveauDeLEcart(500)).toBe('surveiller');
  });
});
