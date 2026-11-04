import { describe, expect, it } from 'vitest';

import { formaterMois, joursAvantLaPaie, moisPrecedent, niveauDuStatut } from './affichage.ts';
import {
  calculerPaie,
  droitsPaie,
  erreurAjustement,
  estModifiable,
  joursEntre,
  montantAPayer,
  paiementOuvert,
  totaux,
} from './regles.ts';
import type { Employe } from './types.ts';

const employe = (surcharge: Partial<Employe> = {}): Employe => ({
  id: 'x',
  nom: 'X',
  poste: 'Poste',
  base: 60_000,
  absences: 0,
  avances: 0,
  impaye: 0,
  ajustements: [],
  paiements: [],
  ...surcharge,
});

describe('calcul de la paie (US-120)', () => {
  it('net = base − absences − avances − pénalités + gains + impayé', () => {
    const c = calculerPaie(
      employe({
        absences: 1,
        avances: 10_000,
        impaye: 1_000,
        ajustements: [
          { id: 'a', type: 'gain', libelle: 'Prime', montant: 5_000, date: '2026-10-11', par: 'P' },
          {
            id: 'b',
            type: 'penalite',
            libelle: 'Manque',
            montant: 500,
            date: '2026-10-13',
            par: 'P',
          },
        ],
      }),
    );
    expect(c).toMatchObject({ absences: 2_308, gains: 5_000, penalites: 500, net: 53_192 });
    expect(c.reste).toBe(53_192);
  });

  it('une absence vaut base ÷ 26, arrondie au franc avant de multiplier', () => {
    expect(calculerPaie(employe({ base: 70_000, absences: 2 })).absences).toBe(5_384);
    expect(calculerPaie(employe({ base: 50_000, absences: 1 })).absences).toBe(1_923);
  });

  it('les paiements réduisent le reste, un paiement partiel laisse un impayé', () => {
    const c = calculerPaie(
      employe({ paiements: [{ montant: 20_000, mode: 'especes', date: '2026-10-14', par: 'W' }] }),
    );
    expect(c).toMatchObject({ net: 60_000, paye: 20_000, reste: 40_000 });
  });

  it('totalise net, payé, reste et impayés repris', () => {
    expect(totaux([employe({ impaye: 5_000 }), employe({ avances: 10_000 })])).toEqual({
      net: 115_000,
      paye: 0,
      reste: 115_000,
      impayes: 5_000,
    });
  });
});

describe('droits et états de la paie (§3.3, §5.10)', () => {
  it('le gérant prépare, soumet et paie ; le propriétaire valide ; les autres ne voient rien', () => {
    expect(droitsPaie('gerant')).toEqual({
      voir: true,
      preparer: true,
      soumettre: true,
      valider: false,
      payer: true,
    });
    expect(droitsPaie('proprietaire')).toEqual({
      voir: true,
      preparer: true,
      soumettre: false,
      valider: true,
      payer: false,
    });
    for (const profil of ['caissier', 'production', 'administrateur', null] as const) {
      expect(droitsPaie(profil).voir).toBe(false);
      expect(droitsPaie(profil).preparer).toBe(false);
    }
  });

  it('les lignes ne se modifient qu’en brouillon, le paiement s’ouvre après validation', () => {
    expect(estModifiable('brouillon')).toBe(true);
    expect(estModifiable('soumis')).toBe(false);
    expect(paiementOuvert('soumis')).toBe(false);
    expect(paiementOuvert('valide')).toBe(true);
    expect(paiementOuvert('en-paiement')).toBe(true);
    expect(paiementOuvert('payee')).toBe(false);
  });

  it('description et montant sont obligatoires, le montant est un entier positif', () => {
    expect(erreurAjustement('  ', '500')).toBe('libelle');
    expect(erreurAjustement('Prime', '')).toBe('montant');
    expect(erreurAjustement('Prime', '0')).toBe('montant');
    expect(erreurAjustement('Prime', '12,5')).toBe('montant');
    expect(erreurAjustement('Prime', '500')).toBeNull();
  });

  it('un paiement vide vaut tout le reste, jamais plus que le reste', () => {
    expect(montantAPayer('', 52_192)).toBe(52_192);
    expect(montantAPayer('30000', 52_192)).toBe(30_000);
    expect(montantAPayer('90000', 52_192)).toBe(52_192);
    expect(montantAPayer('0', 52_192)).toBe(52_192);
  });
});

describe('affichage', () => {
  it('compte les jours avant la paie', () => {
    expect(joursEntre('2026-10-14', '2026-10-31')).toBe(17);
    expect(joursAvantLaPaie('2026-10-31', '2026-10-31')).toBe(0);
    expect(joursAvantLaPaie('2026-11-02', '2026-10-31')).toBe(-2);
  });

  it('écrit les mois en toutes lettres dans les deux langues', () => {
    expect(formaterMois('2026-10', 'fr')).toBe('Octobre 2026');
    expect(formaterMois('2026-10', 'en')).toBe('October 2026');
    expect(moisPrecedent('2026-10', 'fr')).toBe('septembre');
    expect(moisPrecedent('2026-01', 'en')).toBe('December');
  });

  it('colore l’état : brouillon neutre, soumis et paiement en cours à surveiller, validé et payée ok', () => {
    expect(niveauDuStatut('brouillon')).toBe('neutre');
    expect(niveauDuStatut('soumis')).toBe('surveiller');
    expect(niveauDuStatut('en-paiement')).toBe('surveiller');
    expect(niveauDuStatut('valide')).toBe('ok');
    expect(niveauDuStatut('payee')).toBe('ok');
  });
});
