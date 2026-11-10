import { describe, expect, it } from 'vitest';

import {
  apercuTelephone,
  ecransAccessibles,
  formaterAcces,
  formaterTelephone,
  identifiantDe,
  MATRICE_DES_DROITS,
  nomDeGroupePris,
  peutAdministrer,
  saisirTelephone,
  validerNouvelUtilisateur,
} from './regles.ts';

const valide = { nom: 'Ada', email: 'ada@gmail.com', telephone: '677412018', groupe: 'g1' };

describe('droit', () => {
  it('seul l’administrateur administre', () => {
    expect(peutAdministrer('administrateur')).toBe(true);
    for (const p of [
      'caissier',
      'gerant',
      'production',
      'proprietaire',
      null,
      undefined,
    ] as const) {
      expect(peutAdministrer(p)).toBe(false);
    }
  });
});

describe('téléphone', () => {
  it('ne garde que chiffres et espaces, 14 caractères au plus', () => {
    expect(saisirTelephone('6a77-41 20 18 99 99 99')).toBe('67741 20 18 99');
  });
  it('s’enregistre en « 6 77 41 20 18 »', () => {
    expect(formaterTelephone('677 41 20 18')).toBe('6 77 41 20 18');
  });
  it('s’aperçoit au fil de la saisie', () => {
    expect(apercuTelephone('')).toBe('+237 …');
    expect(apercuTelephone('6')).toBe('+237 6');
    expect(apercuTelephone('677')).toBe('+237 6 77');
    expect(apercuTelephone('677412018')).toBe('+237 6 77 41 20 18');
  });
});

describe('contrôles de création', () => {
  it('accepte une saisie correcte', () => {
    expect(validerNouvelUtilisateur(valide, [])).toEqual({});
  });
  it('exige le nom', () => {
    expect(validerNouvelUtilisateur({ ...valide, nom: '  ' }, []).nom).toBe('nom_obligatoire');
  });
  it('borne le nom à 60 caractères et l’adresse à 120', () => {
    expect(validerNouvelUtilisateur({ ...valide, nom: 'x'.repeat(61) }, []).nom).toBe(
      'nom_trop_long',
    );
    expect(validerNouvelUtilisateur({ ...valide, nom: 'x'.repeat(60) }, []).nom).toBeUndefined();
    expect(
      validerNouvelUtilisateur({ ...valide, email: `${'a'.repeat(111)}@gmail.com` }, []).email,
    ).toBe('email_trop_long');
  });
  it('contrôle la forme de l’e-mail', () => {
    for (const email of ['', 'ada', 'ada@', 'ada@gmail', 'a da@gmail.com']) {
      expect(validerNouvelUtilisateur({ ...valide, email }, []).email).toBe('email_invalide');
    }
  });
  it('refuse un e-mail déjà pris, sans casse ni espaces', () => {
    expect(
      validerNouvelUtilisateur({ ...valide, email: ' ADA@gmail.com ' }, ['ada@gmail.com']).email,
    ).toBe('email_deja_utilise');
  });
  it('veut 9 chiffres commençant par 6', () => {
    for (const telephone of ['', '67741201', '6774120189', '277412018']) {
      expect(validerNouvelUtilisateur({ ...valide, telephone }, []).telephone).toBe(
        'telephone_invalide',
      );
    }
    expect(validerNouvelUtilisateur({ ...valide, telephone: '6 77 41 20 18' }, [])).toEqual({});
  });
  it('exige un groupe, et un groupe connu quand la liste est donnée', () => {
    expect(validerNouvelUtilisateur({ ...valide, groupe: '' }, []).groupe).toBe(
      'groupe_obligatoire',
    );
    expect(validerNouvelUtilisateur(valide, [], ['g2']).groupe).toBe('groupe_obligatoire');
  });
});

describe('identifiants et groupes', () => {
  it('forme l’identifiant sur l’e-mail et saute ceux qui existent', () => {
    expect(identifiantDe('Ada.Lovelace@gmail.com', [], 1)).toBe('adalovelace001');
    expect(identifiantDe('ada@gmail.com', ['ada001', 'ada002'], 1)).toBe('ada003');
  });
  it('compare les noms de groupe sans tenir compte de la casse', () => {
    expect(nomDeGroupePris(' DIRECTION ', [{ nom: 'Direction' }])).toBe(true);
    expect(nomDeGroupePris('Autre', [{ nom: 'Direction' }])).toBe(false);
  });
});

describe('accès affichés', () => {
  it('suivent navigation.ts, dans l’ordre du menu de la maquette', () => {
    expect(ecransAccessibles('caissier')).toEqual([
      'session',
      'caisses',
      'clients',
      'depenses',
      'demandes',
    ]);
    expect(ecransAccessibles('production')).toEqual(['semaines', 'production', 'stocks']);
    expect(ecransAccessibles('administrateur')).toEqual([
      'utilisateurs',
      'sauvegardes',
      'journal',
      'parametres',
    ]);
    expect(ecransAccessibles('gerant')).not.toContain('utilisateurs');
    expect(ecransAccessibles('proprietaire')).toContain('parametres');
  });
});

describe('dernier accès', () => {
  it('se lit « 14 oct. 18:02 » en français et « Oct 14 18:02 » en anglais', () => {
    expect(formaterAcces('2026-10-14T18:02', 'fr')).toBe('14 oct. 18:02');
    expect(formaterAcces('2026-10-14T18:02', 'en')).toBe('Oct 14 18:02');
    expect(formaterAcces('2026-11-01T06:00', 'fr')).toBe('1er nov. 06:00');
  });
  it('vaut « — » quand la personne ne s’est jamais connectée', () => {
    expect(formaterAcces('', 'fr')).toBe('—');
  });
});

describe('droits par profil', () => {
  it('porte les douze fonctions de la maquette et ne donne les comptes qu’à l’administrateur', () => {
    expect(MATRICE_DES_DROITS).toHaveLength(12);
    const comptes = MATRICE_DES_DROITS.find((l) => l.cle === 'comptes')!;
    expect(comptes.droits).toEqual(['non', 'non', 'non', 'non', 'oui']);
  });
});
