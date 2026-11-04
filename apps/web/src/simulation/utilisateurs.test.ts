import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneUtilisateurs } from '@/espaces/gestion/utilisateurs/types.ts';

import { MOT_DE_PASSE_DEMO } from './donnees.ts';
import { repondre, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte, lireUtilisateurConnecte } from './session.ts';
import { invitationsEnFile, journalUtilisateurs } from './utilisateurs.ts';

const RACINE = '/api/v1/simulation/gestion/utilisateurs/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneUtilisateurs;
const compte = async (id: string) => (await lire()).utilisateurs.find((u) => u.id === id)!;

const nouveau = {
  nom: 'Christelle Ndongo',
  email: 'c.ndongo@gmail.com',
  telephone: '655 12 34 56',
  groupe: 'g1',
  canal: 'sms',
  invitation: true,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('admin');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur Utilisateurs : droits', () => {
  it('refuse sans connexion', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET')).statut).toBe(403);
    expect((await appeler('GET')).json.code).toBe('non_authentifie');
  });

  it.each(['caissier', 'gerant', 'production', 'proprietaire'])(
    'refuse le profil %s pour chaque route',
    async (profil) => {
      memoriserUtilisateurConnecte(
        { caissier: 'davy', gerant: 'willy', production: 'serge', proprietaire: 'fotso' }[profil]!,
      );
      for (const [methode, chemin] of [
        ['GET', ''],
        ['POST', ''],
        ['POST', 'groupes/'],
        ['PUT', 'davy/groupe/'],
        ['POST', 'davy/reinitialiser-code/'],
        ['PUT', 'davy/activation/'],
      ] as const) {
        const { statut, json } = await appeler(methode, chemin, nouveau);
        expect([statut, json.code]).toEqual([403, 'droit_insuffisant']);
      }
      memoriserUtilisateurConnecte('admin');
      expect((await lire()).utilisateurs).toHaveLength(9);
    },
  );

  it('laisse l’administrateur lire les neuf comptes et six groupes', async () => {
    const etat = await lire();
    expect(etat.moi).toBe('admin');
    expect(etat.utilisateurs).toHaveLength(9);
    expect(etat.groupes.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']);
  });
});

describe('faux serveur Utilisateurs : création (US-020)', () => {
  it('crée le compte, met l’invitation en file et trace', async () => {
    const { statut, json } = await appeler('POST', '', nouveau);
    expect(statut).toBe(201);
    expect(json.utilisateur).toMatchObject({
      nom: 'Christelle Ndongo',
      email: 'c.ndongo@gmail.com',
      telephone: '6 55 12 34 56',
      groupe: 'g1',
      profil: 'caissier',
      actif: true,
    });
    expect(invitationsEnFile()).toHaveLength(1);
    expect(invitationsEnFile()[0]).toMatchObject({ canal: 'sms' });
    expect(journalUtilisateurs()[0]?.quoi).toContain('invitation envoyée par SMS');
    expect((await lire()).utilisateurs).toHaveLength(10);
  });

  it('n’envoie pas d’invitation si on la décoche', async () => {
    await appeler('POST', '', { ...nouveau, invitation: false });
    expect(invitationsEnFile()).toHaveLength(0);
  });

  it('refuse un e-mail invalide, un téléphone hors règle, un nom vide et un groupe absent', async () => {
    const { statut, json } = await appeler('POST', '', {
      ...nouveau,
      nom: ' ',
      email: 'pas-un-email',
      telephone: '755123456',
      groupe: '',
    });
    expect(statut).toBe(400);
    expect(json.code).toBe('champs_invalides');
    expect(json.erreurs).toEqual({
      nom: 'nom_obligatoire',
      email: 'email_invalide',
      telephone: 'telephone_invalide',
      groupe: 'groupe_obligatoire',
    });
  });

  it('refuse un e-mail déjà utilisé, sans tenir compte de la casse', async () => {
    const { statut, json } = await appeler('POST', '', {
      ...nouveau,
      email: 'DAVY.boulfaubourg@gmail.com',
    });
    expect(statut).toBe(400);
    expect(json.erreurs.email).toBe('email_deja_utilise');
  });

  it('refuse un groupe inconnu et un canal inconnu', async () => {
    expect((await appeler('POST', '', { ...nouveau, groupe: 'g99' })).json.erreurs.groupe).toBe(
      'groupe_obligatoire',
    );
    const { statut, json } = await appeler('POST', '', { ...nouveau, canal: 'fax' });
    expect([statut, json.code]).toEqual([400, 'canal_inconnu']);
  });

  it('le nouveau compte peut se connecter, mot de passe de démonstration compris', async () => {
    await appeler('POST', '', nouveau);
    memoriserUtilisateurConnecte(null);
    const connexion = repondre(new URL('http://x/api/v1/simulation/identification/'), 'POST', {
      methode: 'email',
      email: 'c.ndongo@gmail.com',
      motDePasse: MOT_DE_PASSE_DEMO,
      deuxFacteurs: false,
    });
    expect(connexion.status).toBe(200);
    expect(lireUtilisateurConnecte()?.nom).toBe('Christelle Ndongo');
    // Son dernier accès est noté.
    memoriserUtilisateurConnecte('admin');
    expect((await lire()).utilisateurs.at(-1)?.dernierAcces).toMatch(/^2026-10-14T\d\d:\d\d$/);
  });
});

describe('faux serveur Utilisateurs : groupes (US-021)', () => {
  it('change le groupe : le profil change aussitôt, le changement est tracé', async () => {
    const { statut } = await appeler('PUT', 'davy/groupe/', { groupe: 'g3' });
    expect(statut).toBe(200);
    expect(await compte('davy')).toMatchObject({ groupe: 'g3', profil: 'gerant' });
    expect(journalUtilisateurs()[0]?.quoi).toBe(
      'Changement de groupe : Davy → Gérants de la semaine',
    );
    // Davy, qui se connecte ensuite, a les droits du gérant.
    memoriserUtilisateurConnecte('davy');
    expect(lireUtilisateurConnecte()?.profil).toBe('gerant');
  });

  it('refuse de changer son propre groupe (409), un inconnu (404)', async () => {
    expect((await appeler('PUT', 'admin/groupe/', { groupe: 'g1' })).statut).toBe(409);
    expect((await appeler('PUT', 'nobody/groupe/', { groupe: 'g1' })).statut).toBe(404);
    expect((await appeler('PUT', 'davy/groupe/', { groupe: 'g99' })).json.code).toBe(
      'groupe_inconnu',
    );
  });

  it('crée un groupe, refuse un nom vide, un doublon et un profil inconnu', async () => {
    const cree = await appeler('POST', 'groupes/', {
      nom: 'Livreurs',
      profil: 'caissier',
      description: '',
    });
    expect(cree.statut).toBe(201);
    expect((cree.json as unknown as InstantaneUtilisateurs).groupes).toHaveLength(7);
    expect(journalUtilisateurs()[0]?.quoi).toBe('Création du groupe Livreurs (Caissier)');
    expect((await appeler('POST', 'groupes/', { nom: ' ', profil: 'caissier' })).json.code).toBe(
      'nom_obligatoire',
    );
    expect(
      (await appeler('POST', 'groupes/', { nom: 'livreurs', profil: 'caissier' })).statut,
    ).toBe(409);
    expect((await appeler('POST', 'groupes/', { nom: 'X', profil: 'roi' })).json.code).toBe(
      'profil_inconnu',
    );
  });
});

describe('faux serveur Utilisateurs : codes et activation', () => {
  it('réinitialise le code et trace, 404 pour un inconnu', async () => {
    expect((await appeler('POST', 'davy/reinitialiser-code/')).statut).toBe(200);
    expect(journalUtilisateurs()[0]?.quoi).toBe('Réinitialisation du code de Davy');
    expect((await appeler('POST', 'nobody/reinitialiser-code/')).statut).toBe(404);
  });

  it('désactive un compte : il ne peut plus se connecter ni être affecté', async () => {
    expect((await appeler('PUT', 'davy/activation/', { actif: false })).statut).toBe(200);
    expect((await compte('davy')).actif).toBe(false);
    const code = repondre(new URL('http://x/api/v1/simulation/identification/'), 'POST', {
      methode: 'code',
      utilisateur: 'davy',
      code: '1234',
      deuxFacteurs: false,
    });
    expect(code.status).toBe(400);
    const liste = repondre(new URL('http://x/api/v1/simulation/utilisateurs/'), 'GET', {});
    expect((await liste.json()).map((u: { id: string }) => u.id)).not.toContain('davy');
    expect((await appeler('PUT', 'davy/activation/', { actif: true })).statut).toBe(200);
    expect((await compte('davy')).actif).toBe(true);
    expect(journalUtilisateurs().map((j) => j.quoi)).toContain('Désactivation du compte Davy');
  });

  it('refuse de désactiver son propre compte (409) et un état invalide (400)', async () => {
    expect((await appeler('PUT', 'admin/activation/', { actif: false })).statut).toBe(409);
    expect((await appeler('PUT', 'davy/activation/', { actif: 'non' })).statut).toBe(400);
    expect((await appeler('PUT', 'nobody/activation/', { actif: false })).statut).toBe(404);
  });
});

describe('faux serveur Utilisateurs : sessions déjà ouvertes et administrateurs', () => {
  it('une session ouverte dont le compte est désactivé reçoit 403', async () => {
    // Deuxième administrateur : Davy passe dans le groupe « Support informatique ».
    await appeler('PUT', 'davy/groupe/', { groupe: 'g6' });
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('GET')).statut).toBe(200);
    // L'administrateur d'origine désactive Davy, dont la session était ouverte.
    memoriserUtilisateurConnecte('admin');
    await appeler('PUT', 'davy/activation/', { actif: false });
    memoriserUtilisateurConnecte('davy');
    const refus = await appeler('GET');
    expect([refus.statut, refus.json.code]).toEqual([403, 'non_authentifie']);
  });

  it('une session ouverte dont le compte est rétrogradé reçoit 403', async () => {
    await appeler('PUT', 'davy/groupe/', { groupe: 'g6' });
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('GET')).statut).toBe(200);
    memoriserUtilisateurConnecte('admin');
    await appeler('PUT', 'davy/groupe/', { groupe: 'g1' });
    memoriserUtilisateurConnecte('davy');
    const refus = await appeler('POST', '', nouveau);
    expect([refus.statut, refus.json.code]).toEqual([403, 'droit_insuffisant']);
  });

  it('avec deux administrateurs, chacun gère l’autre mais pas lui-même', async () => {
    await appeler('PUT', 'davy/groupe/', { groupe: 'g6' });
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('PUT', 'davy/activation/', { actif: false })).json.code).toBe(
      'compte_propre',
    );
    expect((await appeler('PUT', 'admin/activation/', { actif: false })).statut).toBe(200);
    expect((await compte('admin')).actif).toBe(false);
  });

  it('refuse de désactiver ou de rétrograder l’unique administrateur actif', async () => {
    const desactiver = await appeler('PUT', 'admin/activation/', { actif: false });
    expect([desactiver.statut, desactiver.json.code]).toEqual([409, 'dernier_administrateur']);
    const retrograder = await appeler('PUT', 'admin/groupe/', { groupe: 'g1' });
    expect([retrograder.statut, retrograder.json.code]).toEqual([409, 'dernier_administrateur']);
    expect(await compte('admin')).toMatchObject({ actif: true, profil: 'administrateur' });
    // Le garder dans un groupe administrateur reste possible.
    expect((await appeler('PUT', 'admin/groupe/', { groupe: 'g6' })).statut).toBe(409);
  });

  it('ignore un booléen d’invitation qui n’en est pas un : l’invitation part', async () => {
    await appeler('POST', '', { ...nouveau, invitation: 'non' });
    expect(invitationsEnFile()).toHaveLength(1);
  });
});
