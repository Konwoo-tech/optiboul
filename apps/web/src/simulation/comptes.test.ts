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
    definirActivation('davy', false);
    ajouterGroupe({ id: 'gx', nom: 'X', profil: 'caissier', description: '' });
    reinitialiserSimulation();
    expect(compteParId('davy')?.actif).toBe(true);
    expect(tousLesGroupes()).toHaveLength(6);
  });
});

describe('comptes : effets sur le reste de la simulation', () => {
  it('un compte désactivé ne se connecte plus et quitte la liste de connexion', () => {
    definirActivation('davy', false);
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
    affecterAuGroupe('davy', groupeParId('g3')!);
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
    ajouterCompte({
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

  it('les affectations de semaine et de planning ne proposent que des comptes actifs', async () => {
    memoriserUtilisateurConnecte('fotso');
    const lire = async () =>
      (await repondre(
        new URL('http://x/api/v1/simulation/gestion/semaines/'),
        'GET',
        {},
      ).json()) as { candidats?: unknown };
    // La réponse doit rester lisible quand un gérant est désactivé.
    definirActivation('patrick', false);
    await expect(lire()).resolves.toBeDefined();
    expect(
      comptesActifs()
        .filter((c) => c.profil === 'gerant')
        .map((c) => c.id),
    ).toEqual(['willy', 'christelle']);
    // Le planning garde le nom d'un compte désactivé (historique).
    expect(personne('patrick')?.nom).toBe('Patrick');
  });
});
