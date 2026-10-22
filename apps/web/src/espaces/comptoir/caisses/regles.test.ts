import { describe, expect, it } from 'vitest';

import {
  attenduDeCaisse,
  cartesVisibles,
  depassePlafond,
  droitsCaisse,
  ecartDeCaisse,
  lignesDuTableau,
  montantProposeAuCoffre,
  nombreSaisi,
  ouvertureHorsPlanning,
  PLAFOND_CAISSE,
  statutDeSession,
  statutEcart,
  syntheseCaissiere,
} from './regles.ts';
import type { Personne, SessionCaisse } from './types.ts';

const davy: Personne = { id: 'davy', nom: 'Davy' };
const rachel: Personne = { id: 'rachel', nom: 'Rachel' };

const session = (autres: Partial<SessionCaisse> = {}): SessionCaisse => ({
  id: 'x',
  jour: '2026-10-12',
  type: 'jour',
  caissiere: rachel,
  ouverture: { heure: '06:00', par: 'Rachel' },
  fermeture: { heure: '17:55', par: 'Rachel' },
  fonds: 20_000,
  attendu: 158_400,
  compte: 158_400,
  recette: 186_200,
  enCours: false,
  ...autres,
});

describe('écart de caisse', () => {
  it('vaut compté − attendu : négatif quand il manque de l’argent', () => {
    expect(ecartDeCaisse(241_350, 240_850)).toBe(-500);
    expect(ecartDeCaisse(149_900, 150_400)).toBe(500);
    expect(ecartDeCaisse(158_400, 158_400)).toBe(0);
  });

  it('donne le statut juste, manque ou excédent', () => {
    expect(statutEcart(0)).toBe('juste');
    expect(statutEcart(-1)).toBe('manque');
    expect(statutEcart(1)).toBe('excedent');
  });

  it('reste un entier : aucun flottant', () => {
    expect(Number.isInteger(ecartDeCaisse(22_950, 22_450))).toBe(true);
  });
});

describe('espèces attendues', () => {
  it('= fonds + espèces − dépenses − remises (US-042)', () => {
    // Nuit du 14 octobre de la maquette : 20 000 + 33 950 − 31 000.
    expect(attenduDeCaisse({ fonds: 20_000, especes: 33_950, depenses: 31_000, remises: 0 })).toBe(
      22_950,
    );
    expect(
      attenduDeCaisse({ fonds: 20_000, especes: 113_950, depenses: 31_000, remises: 90_000 }),
    ).toBe(12_950);
  });
});

describe('plafond et remise au coffre (US-041)', () => {
  it('le plafond est de 100 000 FCFA', () => {
    expect(PLAFOND_CAISSE).toBe(100_000);
  });

  it('propose la remise au-delà du plafond seulement', () => {
    expect(depassePlafond(100_000)).toBe(false);
    expect(depassePlafond(100_001)).toBe(true);
    expect(depassePlafond(22_950)).toBe(false);
  });

  it('propose de remettre tout sauf le fonds de caisse', () => {
    expect(montantProposeAuCoffre(102_950, 20_000)).toBe(82_950);
    expect(montantProposeAuCoffre(15_000, 20_000)).toBe(0);
  });
});

describe('saisie d’un montant', () => {
  it('ne garde que les chiffres', () => {
    expect(nombreSaisi('22 450 FCFA')).toBe(22_450);
    expect(nombreSaisi('')).toBe(0);
    expect(nombreSaisi('abc')).toBe(0);
  });
});

describe('droits d’affichage par profil', () => {
  it('la caissière voit ses caisses, ouvre, et ferme seulement la sienne', () => {
    expect(droitsCaisse('caissier', true)).toEqual({
      voitToutes: false,
      ouvrir: true,
      fermer: true,
      rouvrir: false,
      remettreAuCoffre: true,
    });
    expect(droitsCaisse('caissier', false)).toMatchObject({
      fermer: false,
      remettreAuCoffre: false,
    });
  });

  it('le gérant voit tout, ouvre, ferme et rouvre', () => {
    expect(droitsCaisse('gerant', false)).toEqual({
      voitToutes: true,
      ouvrir: true,
      fermer: true,
      rouvrir: true,
      remettreAuCoffre: true,
    });
  });

  it('le propriétaire voit tout et rouvre, mais n’ouvre pas de caisse', () => {
    expect(droitsCaisse('proprietaire', false)).toEqual({
      voitToutes: true,
      ouvrir: false,
      fermer: true,
      rouvrir: true,
      remettreAuCoffre: true,
    });
  });

  it.each(['production', 'administrateur', undefined] as const)(
    'le profil %s ne peut rien faire',
    (profil) => {
      expect(droitsCaisse(profil, true)).toEqual({
        voitToutes: false,
        ouvrir: false,
        fermer: false,
        rouvrir: false,
        remettreAuCoffre: false,
      });
    },
  );

  it('n’affiche que la carte de la caissière connectée', () => {
    const toutes = [davy, rachel];
    expect(cartesVisibles(toutes, droitsCaisse('caissier', false), 'rachel')).toEqual([rachel]);
    expect(cartesVisibles(toutes, droitsCaisse('gerant', false), 'willy')).toEqual(toutes);
  });
});

describe('ouverture hors planning', () => {
  it('est signalée quand une autre personne est planifiée', () => {
    expect(ouvertureHorsPlanning(rachel, 'davy')).toBe(true);
    expect(ouvertureHorsPlanning(rachel, 'rachel')).toBe(false);
    expect(ouvertureHorsPlanning(null, 'davy')).toBe(false);
  });
});

describe('tableau et cartes', () => {
  const sessions = [
    session({ id: 'a', jour: '2026-10-12' }),
    session({ id: 'b', jour: '2026-10-13', caissiere: davy, type: 'nuit' }),
    session({
      id: 'c',
      jour: '2026-10-14',
      caissiere: davy,
      enCours: true,
      fermeture: null,
      compte: null,
    }),
  ];

  it('met la plus récente d’abord et filtre par caissière', () => {
    expect(lignesDuTableau(sessions, 'all').map((s) => s.id)).toEqual(['c', 'b', 'a']);
    expect(lignesDuTableau(sessions, 'davy').map((s) => s.id)).toEqual(['c', 'b']);
    expect(lignesDuTableau(sessions, 'rachel').map((s) => s.id)).toEqual(['a']);
  });

  it('résume une caissière : ouvertures, fermetures, recette, écart cumulé, dernière ouverture', () => {
    const resume = syntheseCaissiere(davy, [
      session({ id: 'n1', caissiere: davy, attendu: 241_350, compte: 240_850, recette: 327_400 }),
      session({ id: 'n2', caissiere: davy, attendu: 233_600, compte: 233_600, recette: 301_200 }),
      session({
        id: 'live',
        caissiere: davy,
        enCours: true,
        fermeture: null,
        compte: null,
        attendu: 22_950,
        recette: 58_450,
      }),
    ]);
    expect(resume).toMatchObject({
      ouvertures: 3,
      fermetures: 2,
      recette: 687_050,
      ecart: -500,
    });
    expect(resume.derniere?.id).toBe('live');
  });

  it('ne compte pas l’écart d’une caisse encore ouverte', () => {
    const resume = syntheseCaissiere(davy, [sessions[2]!]);
    expect(resume.ecart).toBe(0);
    expect(resume.fermetures).toBe(0);
  });
});

describe('statut d’une ligne', () => {
  it('ouverte, juste, manque, excédent, avec un niveau de couleur', () => {
    expect(statutDeSession(session({ enCours: true, compte: null }))).toEqual({
      cle: 'ouverte',
      niveau: 'ok',
    });
    expect(statutDeSession(session())).toEqual({ cle: 'juste', niveau: 'ok' });
    expect(statutDeSession(session({ compte: 158_000 }))).toEqual({
      cle: 'manque',
      niveau: 'bloquant',
    });
    expect(statutDeSession(session({ compte: 159_000 }))).toEqual({
      cle: 'excedent',
      niveau: 'surveiller',
    });
  });
});
