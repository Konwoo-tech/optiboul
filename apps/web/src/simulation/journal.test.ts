import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneJournal } from '@/espaces/gestion/journal/types.ts';

import { consigner, lireJournal, reinitialiserJournal, repondreJournal } from './journal.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const JOURNAL = '/api/v1/simulation/gestion/journal/';

async function appeler(
  racine: string,
  methode: string,
  corps: Record<string, unknown> = {},
  requete = '',
) {
  const reponse = repondreJournal(new URL(`http://x${racine}${requete}`), methode, corps)!;
  const texte = await reponse.text();
  return {
    statut: reponse.status,
    entetes: reponse.headers,
    json: (texte ? JSON.parse(texte) : {}) as Record<string, any>,
  };
}

const lire = async (requete = '') =>
  (await appeler(JOURNAL, 'GET', {}, requete)).json as unknown as InstantaneJournal;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserJournal();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('registre du journal : données de départ', () => {
  it('reprend les dix lignes de la maquette, la plus récente d’abord', async () => {
    const { entrees, total, aujourdhui } = await lire();
    expect(aujourdhui).toBe('2026-10-14');
    expect(total).toBe(10);
    expect(entrees[0]).toMatchObject({
      heure: '21:41',
      jour: '2026-10-14',
      auteur: 'Davy',
      profil: 'caissier',
      texte: 'Livraison Aïcha – 7 800 FCFA dû, 7 800 reçu (Orange Money)',
    });
    expect(entrees[8]).toMatchObject({ auteur: 'Serge', profil: 'production', texte: 'Connexion' });
    expect(entrees[9]).toMatchObject({
      jour: '2026-10-13',
      heure: '16:40',
      auteur: 'Willy',
      profil: 'gerant',
    });
  });
});

describe('registre du journal : ajout seul', () => {
  it('une action consignée arrive en tête avec auteur, profil, type, date et heure', () => {
    consigner({ auteur: 'Davy', type: 'caisse', texte: 'Essai' });
    expect(lireJournal()[0]).toMatchObject({
      auteur: 'Davy',
      profil: 'caissier',
      type: 'caisse',
      texte: 'Essai',
      jour: '2026-10-14',
      heure: '18:02',
      quand: '2026-10-14T17:02:00.000Z',
    });
    expect(lireJournal()).toHaveLength(11);
  });

  it('les entrées sont gelées et la liste lue est une copie', () => {
    const lues = lireJournal();
    expect(Object.isFrozen(lues[0])).toBe(true);
    expect(() => {
      (lues[0] as { texte: string }).texte = 'modifié';
    }).toThrow();
    (lues as unknown[]).length = 0;
    expect(lireJournal()).toHaveLength(10);
  });

  it('les valeurs avant / après sont copiées : modifier la lecture ne change pas le registre', () => {
    consigner({
      auteur: 'Willy',
      type: 'paie',
      texte: 'Jour',
      avant: '2026-10-29',
      apres: '2026-10-30',
    });
    const lue = lireJournal()[0] as { avant?: string; apres?: string };
    expect(lue).toMatchObject({ avant: '2026-10-29', apres: '2026-10-30' });
    expect(() => {
      lue.avant = 'falsifié';
    }).toThrow();
    expect(lireJournal()[0]).toMatchObject({ avant: '2026-10-29', apres: '2026-10-30' });
  });

  it('avant sans après (ou l’inverse) n’est pas consigné', () => {
    consigner({ auteur: 'Willy', type: 'paie', texte: 'Jour', avant: 'a' });
    expect(lireJournal()[0]).not.toHaveProperty('avant');
  });

  it('les identifiants sont uniques', () => {
    consigner({ auteur: 'Davy', type: 'caisse', texte: 'A' });
    consigner({ auteur: 'Davy', type: 'caisse', texte: 'B' });
    const ids = lireJournal().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('les décisions et demandes sont rangées dans le type « demande »', () => {
    consigner({ auteur: 'Willy', type: 'stock', texte: 'Accord – Inventaire AUD-08' });
    consigner({ auteur: 'Davy', type: 'session', texte: 'Demande d’autorisation : Alex' });
    consigner({ auteur: 'Willy', type: 'stock', texte: 'Mouvement de stock' });
    expect(
      lireJournal()
        .slice(0, 3)
        .map((e) => e.type),
    ).toEqual(['stock', 'demande', 'demande']);
  });

  it('l’API refuse toute modification (405)', async () => {
    memoriserUtilisateurConnecte(null);
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      // Même sans connexion : la méthode est refusée avant tout, rien n'est consigné.
      expect((await appeler(JOURNAL, methode)).statut).toBe(405);
    }
    memoriserUtilisateurConnecte('willy');
    for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await appeler(JOURNAL, methode, { id: 'J-1' });
      expect(r.statut).toBe(405);
      expect(r.json.code).toBe('journal_non_modifiable');
      expect(r.entetes.get('Allow')).toBe('GET');
    }
    expect(repondreJournal(new URL(`http://x${JOURNAL}J-1/`), 'DELETE', {})).toBeUndefined();
    expect(lireJournal()).toHaveLength(10);
  });
});

describe('faux serveur du journal : droits et filtres', () => {
  it('refuse sans connexion (403) et à la caissière et au chef de production (403)', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler(JOURNAL, 'GET')).json.code).toBe('non_authentifie');
    for (const id of ['davy', 'serge']) {
      memoriserUtilisateurConnecte(id);
      const r = await appeler(JOURNAL, 'GET');
      expect(r.statut).toBe(403);
      expect(r.json.code).toBe('droit_insuffisant');
    }
  });

  it('accepte le gérant, le propriétaire et l’administrateur', async () => {
    for (const id of ['willy', 'fotso', 'admin']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler(JOURNAL, 'GET')).statut).toBe(200);
    }
  });

  it('filtre par auteur, par type et par période (bornes comprises)', async () => {
    expect((await lire('?auteur=Serge')).entrees.map((e) => e.texte)).toEqual(['Connexion']);
    expect((await lire('?type=depense')).total).toBe(2);
    expect((await lire('?du=2026-10-14')).total).toBe(9);
    expect((await lire('?au=2026-10-13')).total).toBe(1);
    expect((await lire('?du=2026-10-13&au=2026-10-13&auteur=Willy&type=depense')).total).toBe(1);
    expect((await lire('?auteur=Willy&type=session')).total).toBe(0);
  });

  it('liste les auteurs du journal, triés', async () => {
    expect((await lire()).auteurs).toEqual(['Davy', 'Serge', 'Willy']);
  });

  it('refuse un type inconnu, une date mal formée et une période inversée (400)', async () => {
    expect((await appeler(JOURNAL, 'GET', {}, '?type=x')).json.code).toBe('type_inconnu');
    expect((await appeler(JOURNAL, 'GET', {}, '?du=14/10/2026')).json.code).toBe(
      'periode_invalide',
    );
    expect((await appeler(JOURNAL, 'GET', {}, '?du=2026-10-15&au=2026-10-14')).json.code).toBe(
      'periode_inversee',
    );
  });

  it('ne montre que les 40 dernières actions mais compte toutes', async () => {
    for (let i = 0; i < 50; i += 1) consigner({ auteur: 'Willy', type: 'caisse', texte: `A${i}` });
    const r = await lire();
    expect(r.entrees).toHaveLength(40);
    expect(r.total).toBe(60);
    expect(r.entrees[0]!.texte).toBe('A49');
  });
});
