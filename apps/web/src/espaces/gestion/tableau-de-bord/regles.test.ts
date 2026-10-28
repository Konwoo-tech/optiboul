import { describe, expect, it } from 'vitest';

import { PROFILS } from '../../../profils.ts';
import {
  formaterTaux,
  jourDuMois,
  jourOrdinal,
  nomDuMois,
  texteAlerte,
  cheminAlerte,
} from './affichage.ts';
import {
  hauteurDeBarre,
  largeurDeBarre,
  peutVoirTableauDeBord,
  tauxEncaissement,
} from './regles.ts';
import { ressources } from '@/i18n';
import i18next from 'i18next';

describe('droit de voir le tableau de bord', () => {
  it('est réservé au gérant et au propriétaire (cahier des charges §3.3)', () => {
    const autorises = (Object.keys(PROFILS) as Array<keyof typeof PROFILS>).filter((profil) =>
      peutVoirTableauDeBord(profil),
    );
    expect(autorises).toEqual(['gerant', 'proprietaire']);
    expect(peutVoirTableauDeBord(null)).toBe(false);
    expect(peutVoirTableauDeBord(undefined)).toBe(false);
  });
});

describe('taux d’encaissement', () => {
  it('s’arrondit au dixième, comme la maquette', () => {
    expect(tauxEncaissement(4_231_400, 4_396_750)).toBe(96.2);
    expect(tauxEncaissement(50, 100)).toBe(50);
    expect(tauxEncaissement(1, 3)).toBe(33.3);
  });

  it('vaut zéro quand rien n’est dû', () => {
    expect(tauxEncaissement(0, 0)).toBe(0);
    expect(tauxEncaissement(500, 0)).toBe(0);
  });

  it('s’écrit avec la virgule en français et le point en anglais', () => {
    expect(formaterTaux(96.2, 'fr')).toBe('96,2');
    expect(formaterTaux(96.2, 'en')).toBe('96.2');
    expect(formaterTaux(100, 'fr')).toBe('100,0');
  });
});

describe('barres', () => {
  it('la plus haute remplit la colonne, les autres sont proportionnelles', () => {
    expect(hauteurDeBarre(352_300, 352_300)).toBe(100);
    expect(hauteurDeBarre(176_150, 352_300)).toBe(50);
  });

  it('une barre ne disparaît jamais', () => {
    expect(hauteurDeBarre(0, 352_300)).toBe(2);
    expect(hauteurDeBarre(100, 0)).toBe(2);
    expect(largeurDeBarre(0, 34_120)).toBe(0.5);
    expect(largeurDeBarre(80, 34_120)).toBe(0.5);
    expect(largeurDeBarre(34_120, 34_120)).toBe(100);
    expect(largeurDeBarre(17_060, 34_120)).toBe(50);
  });
});

describe('affichage', () => {
  it('écrit le mois en toutes lettres', () => {
    expect(nomDuMois('2026-10', 'fr')).toBe('octobre');
    expect(nomDuMois('2026-10', 'en')).toBe('October');
  });

  it('prend le jour du mois dans la date', () => {
    expect(jourDuMois('2026-10-05')).toBe(5);
    expect(jourDuMois('2026-10-14')).toBe(14);
  });

  it('met le jour en ordinal en anglais seulement', () => {
    expect(jourOrdinal(14, 'fr')).toBe('14');
    expect(
      [1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 30].map((jour) => jourOrdinal(jour, 'en')),
    ).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '14th',
      '21st',
      '22nd',
      '23rd',
      '30th',
    ]);
  });

  it('construit l’adresse de l’écran de l’alerte avec son filtre', () => {
    expect(cheminAlerte({ espace: 'gestion', ecran: 'depenses' })).toBe('/gestion/depenses');
    expect(
      cheminAlerte({ espace: 'gestion', ecran: 'clients', parametres: { filtre: 'depasse' } }),
    ).toBe('/gestion/clients?filtre=depasse');
  });
});

describe('phrases des alertes', () => {
  const traduire = (langue: 'fr' | 'en') => {
    const instance = i18next.createInstance();
    void instance.init({
      lng: langue,
      resources: ressources,
      interpolation: { escapeValue: false },
      initAsync: false,
    });
    return instance.t.bind(instance);
  };
  const destination = { espace: 'gestion', ecran: 'depenses' } as const;

  it('dit chaque type d’alerte en français comme la maquette', () => {
    const t = traduire('fr');
    const phrase = (alerte: Parameters<typeof texteAlerte>[1]) =>
      texteAlerte(t, alerte, 'fr').replace(/ /g, ' ');
    const base = { id: 'x', niveau: 'bloquant', destination } as const;
    expect(
      phrase({ ...base, type: 'facture-en-retard', numero: 'FAC-41', montant: 1_405_800 }),
    ).toBe('Facture en retard : FAC-41 · 1 405 800 FCFA');
    expect(phrase({ ...base, type: 'stock-bas', matiere: 'levure' })).toBe(
      'Levure : stock pour moins d’une session',
    );
    expect(phrase({ ...base, type: 'clients-au-dela-du-plafond', clients: 3, plafond: 2000 })).toBe(
      '3 clients au-delà du plafond de 2 000 FCFA',
    );
    expect(phrase({ ...base, type: 'budget-depasse', categorie: 'technique' })).toBe(
      'Technique au-dessus du budget',
    );
    expect(
      phrase({ ...base, type: 'production-non-cloturee', jour: '2026-10-13', creneau: 'nuit' }),
    ).toBe('Production non clôturée : 13 oct. nuit');
    expect(
      phrase({
        ...base,
        type: 'manquant-fournisseur',
        commande: 'BC-032',
        matiere: 'levure',
        manque: 4,
      }),
    ).toBe('Manquant fournisseur : BC-032 · 4 kg');
    expect(
      phrase({
        ...base,
        type: 'manque-de-caisse',
        jour: '2026-10-12',
        creneau: 'nuit',
        caissiere: 'Davy',
        ecart: -500,
      }),
    ).toBe('Manque de caisse 12 oct. nuit · Davy · −500 FCFA');
    expect(phrase({ ...base, type: 'demandes-en-attente', nombre: 1 })).toBe(
      '1 demande en attente',
    );
    expect(phrase({ ...base, type: 'demandes-en-attente', nombre: 3 })).toBe(
      '3 demandes en attente',
    );
    expect(phrase({ ...base, type: 'ecart-matiere', par: 'Serge', motif: 'brule' })).toBe(
      'Écart matière signalé par Serge : Brûlé',
    );
  });

  it('les dit aussi en anglais', () => {
    const t = traduire('en');
    const phrase = (alerte: Parameters<typeof texteAlerte>[1]) =>
      texteAlerte(t, alerte, 'en').replace(/ /g, ' ');
    const base = { id: 'x', niveau: 'surveiller', destination } as const;
    expect(
      phrase({
        ...base,
        type: 'manque-de-caisse',
        jour: '2026-10-12',
        creneau: 'nuit',
        caissiere: 'Davy',
        ecart: -500,
      }),
    ).toBe('Cash shortfall Oct 12 night · Davy · −500 FCFA');
    expect(phrase({ ...base, type: 'stock-bas', matiere: 'levure' })).toBe(
      'Yeast: stock for less than one session',
    );
    expect(phrase({ ...base, type: 'demandes-en-attente', nombre: 1 })).toBe('1 pending request');
    expect(phrase({ ...base, type: 'demandes-en-attente', nombre: 2 })).toBe('2 pending requests');
  });
});
