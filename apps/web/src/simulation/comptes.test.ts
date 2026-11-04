import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  affecterAuGroupe,
  ajouterCompte,
  ajouterGroupe,
  compteParId,
  comptesActifs,
  definirActivation,
  groupeParId,
  tousLesComptes,
  tousLesGroupes,
  utilisateursActifs,
} from './comptes.ts';
import { COMPTES_SIMULES, MOT_DE_PASSE_DEMO } from './donnees.ts';
import { personne } from './planning.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { lireUtilisateurConnecte, memoriserUtilisateurConnecte } from './session.ts';

const identifier = (corps: Record<string, unknown>) =>
  repondre(new URL('http://x/api/v1/simulation/identification/'), 'POST', {
    deuxFacteurs: false,
    ...corps,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
});
afterEach(() => vi.useRealTimers());

describe('comptes : source unique', () => {
  it('part des neuf comptes et six groupes de démonstration, tous actifs', () => {
    expect(tousLesComptes().map((c) => c.id)).toEqual(COMPTES_SIMULES.map((c) => c.id));
    expect(comptesActifs()).toHaveLength(9);
    expect(tousLesGroupes().map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
    expect(compteParId('davy')).toMatchObject({ groupe: 'g1', actif: true });
  });

  it('chaque compte appartient à un groupe qui porte son profil', () => {
    for (const c of tousLesComptes()) expect(groupeParId(c.groupe)?.profil).toBe(c.profil);
  });

  it('ne montre à la connexion ni le téléphone ni le groupe', () => {
    expect(Object.keys(utilisateursActifs()[0]!).sort()).toEqual(['email', 'id', 'nom', 'profil']);
  });

  it('se remet à zéro avec la simulation', () => {
    definirActivation('administrateur', 'davy', false);
    ajouterGroupe('administrateur', { id: 'gx', nom: 'X', profil: 'caissier', description: '' });
    reinitialiserSimulation();
    expect(compteParId('davy')?.actif).toBe(true);
    expect(tousLesGroupes()).toHaveLength(6);
  });
});

describe('comptes : effets sur le reste de la simulation', () => {
  it('un compte désactivé ne se connecte plus et quitte la liste de connexion', () => {
    definirActivation('administrateur', 'davy', false);
    expect(identifier({ methode: 'code', utilisateur: 'davy', code: '1234' }).status).toBe(400);
    expect(
      identifier({
        methode: 'email',
        email: 'davy.boulfaubourg@gmail.com',
        motDePasse: MOT_DE_PASSE_DEMO,
      }).status,
    ).toBe(400);
    expect(utilisateursActifs().map((u) => u.id)).not.toContain('davy');
    memoriserUtilisateurConnecte('davy');
    expect(lireUtilisateurConnecte()).toBeUndefined();
  });

  it('un changement de groupe change aussitôt le profil de la session', () => {
    memoriserUtilisateurConnecte('davy');
    expect(lireUtilisateurConnecte()?.profil).toBe('caissier');
    affecterAuGroupe('administrateur', 'davy', groupeParId('g3')!);
    expect(lireUtilisateurConnecte()?.profil).toBe('gerant');
    expect(personne('davy')?.profil).toBe('gerant');
  });

  it('la connexion note le dernier accès', () => {
    expect(compteParId('rachel')?.dernierAcces).toBe('2026-10-14T06:01');
    expect(identifier({ methode: 'code', utilisateur: 'rachel', code: '1234' }).status).toBe(200);
    expect(compteParId('rachel')?.dernierAcces).toMatch(/^2026-10-14T\d\d:\d\d$/);
    expect(compteParId('rachel')?.dernierAcces).not.toBe('2026-10-14T06:01');
  });

  it('un compte ajouté se connecte par e-mail', () => {
    ajouterCompte('administrateur', {
      id: 'ada001',
      nom: 'Ada',
      profil: 'caissier',
      email: 'ada@gmail.com',
      telephone: '6 55 12 34 56',
      groupe: 'g1',
      dernierAcces: '',
      actif: true,
      canal: 'sms',
    });
    const reponse = identifier({
      methode: 'email',
      email: 'ADA@gmail.com',
      motDePasse: MOT_DE_PASSE_DEMO,
    });
    expect(reponse.status).toBe(200);
    expect(lireUtilisateurConnecte()?.nom).toBe('Ada');
  });

  it('les candidats de semaine et de caisse écartent les comptes désactivés', async () => {
    memoriserUtilisateurConnecte('fotso');
    const semaines = async () =>
      (await repondre(
        new URL('http://x/api/v1/simulation/gestion/semaines/'),
        'GET',
        {},
      ).json()) as {
        gerants: { id: string }[];
      };
    expect((await semaines()).gerants.map((g) => g.id)).toEqual(['willy', 'patrick', 'christelle']);
    definirActivation('administrateur', 'patrick', false);
    expect((await semaines()).gerants.map((g) => g.id)).toEqual(['willy', 'christelle']);

    const caisses = async () =>
      (await repondre(new URL('http://x/api/v1/simulation/caisses/'), 'GET', {}).json()) as {
        caissieres: { id: string }[];
      };
    expect((await caisses()).caissieres.map((c) => c.id)).toEqual(['davy', 'rachel']);
    definirActivation('administrateur', 'davy', false);
    expect((await caisses()).caissieres.map((c) => c.id)).toEqual(['rachel']);
    // Le planning garde le nom d'un compte désactivé (historique).
    expect(personne('patrick')?.nom).toBe('Patrick');
  });

  it('la liste de connexion ne porte aucun champ sensible et ignore les comptes désactivés', async () => {
    definirActivation('administrateur', 'rachel', false);
    const liste = (await repondre(
      new URL('http://x/api/v1/simulation/utilisateurs/'),
      'GET',
      {},
    ).json()) as Record<string, unknown>[];
    expect(liste).toHaveLength(8);
    for (const u of liste) expect(Object.keys(u).sort()).toEqual(['email', 'id', 'nom', 'profil']);
    expect(JSON.stringify(liste)).not.toMatch(/telephone|6 77|dernierAcces|groupe/);
  });

  it('la connexion Google refuse un compte désactivé', () => {
    expect(identifier({ methode: 'google', email: 'davy.boulfaubourg@gmail.com' }).status).toBe(
      200,
    );
    memoriserUtilisateurConnecte(null);
    definirActivation('administrateur', 'davy', false);
    const reponse = identifier({ methode: 'google', email: 'davy.boulfaubourg@gmail.com' });
    expect(reponse.status).toBe(400);
    expect(lireUtilisateurConnecte()).toBeUndefined();
  });
});

describe('comptes : écritures réservées à l’administrateur', () => {
  it('refuse tout autre profil sans rien changer', () => {
    const groupe = { id: 'gx', nom: 'X', profil: 'caissier' as const, description: '' };
    const compte = { ...compteParId('davy')!, id: 'x001', email: 'x@gmail.com' };
    for (const profil of ['caissier', 'gerant', 'production', 'proprietaire'] as const) {
      expect(ajouterCompte(profil, compte)).toBe(false);
      expect(ajouterGroupe(profil, groupe)).toBe(false);
      expect(affecterAuGroupe(profil, 'davy', groupeParId('g3')!)).toBe(false);
      expect(definirActivation(profil, 'davy', false)).toBe(false);
    }
    expect(tousLesComptes()).toHaveLength(9);
    expect(tousLesGroupes()).toHaveLength(6);
    expect(compteParId('davy')).toMatchObject({ groupe: 'g1', profil: 'caissier', actif: true });
  });

  it('refuse un compte inconnu même pour l’administrateur', () => {
    expect(definirActivation('administrateur', 'nobody', false)).toBe(false);
    expect(affecterAuGroupe('administrateur', 'nobody', groupeParId('g3')!)).toBe(false);
  });
});
