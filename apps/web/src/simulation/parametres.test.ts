import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEUIL_ECART_KG_PAR_SAC } from '@/espaces/atelier/production/regles.ts';
import { TOLERANCE_INVENTAIRE } from '@/espaces/atelier/stocks/regles.ts';
import { FONDS_PROPOSE, PLAFOND_CAISSE } from '@/espaces/comptoir/caisses/regles.ts';
import { SEUIL_PAR_DEFAUT } from '@/espaces/comptoir/depenses/regles.ts';
import { PLAFOND_PAR_DEFAUT } from '@/espaces/comptoir/session/calculs.ts';
import type { Parametre, ValeurPassee } from '@/espaces/gestion/parametres/types.ts';
import { formatFCFA } from '@/utils';

import { lireJournal } from './journal.ts';
import { defautDuParametre, valeurDuParametre } from './parametres.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/parametres/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as any };
}

const liste = async () => (await appeler('GET')).json as Parametre[];
const un = async (cle: string) => (await liste()).find((p) => p.cle === cle)!;
const modifier = (cle: string, valeur: unknown) => appeler('PUT', `${cle}/`, { valeur });
const traces = () => lireJournal().filter((e) => e.type === 'parametre');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('fotso');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur Paramètres : catalogue', () => {
  it('expose les 29 paramètres avec leurs valeurs par défaut, comme l’API', async () => {
    const tous = await liste();
    expect(tous).toHaveLength(29);
    expect(new Set(tous.map((p) => p.cle)).size).toBe(29);
    expect(await un('plafond_dette_client')).toMatchObject({
      libelle: 'Plafond de dette par client',
      genre: 'montant',
      unite: 'FCFA',
      valeur: 2_000,
      defaut: 2_000,
      modifie_le: null,
      modifie_par: '',
    });
    expect(await un('inactivite_comptoir')).toMatchObject({ choix: [1, 5, 10, 15] });
    expect(await un('jour_de_paie')).toMatchObject({ minimum: 1, maximum: 28 });
  });

  it('a les mêmes défauts que les règles des écrans (une seule source de vérité)', () => {
    expect(defautDuParametre('plafond_dette_client')).toBe(PLAFOND_PAR_DEFAUT);
    expect(defautDuParametre('seuil_validation_depenses')).toBe(SEUIL_PAR_DEFAUT);
    expect(defautDuParametre('ecart_matiere_kg_par_sac')).toBe(SEUIL_ECART_KG_PAR_SAC);
    expect(defautDuParametre('tolerance_inventaire')).toBe(TOLERANCE_INVENTAIRE);
    expect(defautDuParametre('plafond_especes')).toBe(PLAFOND_CAISSE);
    expect(defautDuParametre('fonds_caisse')).toBe(FONDS_PROPOSE);
    expect(defautDuParametre('inconnu')).toBeUndefined();
  });

  it('ne livre jamais l’état interne : modifier la réponse ne change rien', async () => {
    const copie = (await un('relances_jours')).valeur as string[];
    copie.push('lundi');
    expect((await un('relances_jours')).valeur).toEqual(['jeudi', 'samedi']);
    expect(valeurDuParametre<string[]>('relances_jours')).toEqual(['jeudi', 'samedi']);
    expect(() => valeurDuParametre('inconnu')).toThrow();
  });
});

describe('faux serveur Paramètres : droits', () => {
  it('refuse sans connexion', async () => {
    memoriserUtilisateurConnecte(null);
    for (const [methode, chemin] of [
      ['GET', ''],
      ['PUT', 'fonds_caisse/'],
      ['GET', 'fonds_caisse/historique/'],
    ] as const) {
      const { statut, json } = await appeler(methode, chemin, { valeur: 1 });
      expect([statut, json.code]).toEqual([403, 'non_authentifie']);
    }
  });

  it.each([['davy'], ['willy'], ['serge']])('refuse %s partout', async (id) => {
    memoriserUtilisateurConnecte(id);
    for (const [methode, chemin] of [
      ['GET', ''],
      ['PUT', 'fonds_caisse/'],
      ['GET', 'fonds_caisse/historique/'],
    ] as const) {
      const { statut, json } = await appeler(methode, chemin, { valeur: 1 });
      expect([statut, json.code]).toEqual([403, 'droit_insuffisant']);
    }
    expect(valeurDuParametre('fonds_caisse')).toBe(20_000);
    expect(traces()).toHaveLength(0);
  });

  it('laisse l’administrateur consulter mais pas modifier', async () => {
    memoriserUtilisateurConnecte('admin');
    expect((await appeler('GET')).statut).toBe(200);
    expect((await appeler('GET', 'fonds_caisse/historique/')).statut).toBe(200);
    const { statut, json } = await modifier('fonds_caisse', 30_000);
    expect([statut, json.code]).toEqual([403, 'droit_insuffisant']);
    expect(valeurDuParametre('fonds_caisse')).toBe(20_000);
    expect(traces()).toHaveLength(0);
  });

  it('répond 404 à un paramètre inconnu, 405 à une méthode non permise', async () => {
    expect((await modifier('inconnu', 1)).statut).toBe(404);
    expect((await appeler('GET', 'inconnu/historique/')).statut).toBe(404);
    expect((await appeler('GET', 'fonds_caisse/')).statut).toBe(405);
    expect((await appeler('GET', 'Fonds-Caisse/')).statut).toBe(404);
    expect((await appeler('POST')).statut).toBe(405);
    expect((await appeler('DELETE', 'fonds_caisse/')).statut).toBe(405);
    expect((await appeler('PUT', 'fonds_caisse/historique/')).statut).toBe(405);
  });
});

describe('faux serveur Paramètres : modification', () => {
  it('enregistre la valeur, l’auteur et l’instant, puis la sert à tous', async () => {
    const { statut, json } = await modifier('plafond_dette_client', 3_000);
    expect(statut).toBe(200);
    expect(json).toMatchObject({
      valeur: 3_000,
      defaut: 2_000,
      modifie_par: 'M. Fotso',
      modifie_le: '2026-10-14T17:02:00.000Z',
    });
    expect(valeurDuParametre('plafond_dette_client')).toBe(3_000);
    memoriserUtilisateurConnecte('admin');
    expect((await un('plafond_dette_client')).valeur).toBe(3_000);
  });

  it('garde l’historique, le plus récent d’abord', async () => {
    await modifier('plafond_dette_client', 3_000);
    vi.setSystemTime(new Date('2026-10-14T18:00:00Z'));
    await modifier('plafond_dette_client', 2_500);
    const { json } = await appeler('GET', 'plafond_dette_client/historique/');
    expect((json as ValeurPassee[]).map((v) => [v.valeur, v.auteur, v.le])).toEqual([
      [2_500, 'M. Fotso', '2026-10-14T18:00:00.000Z'],
      [3_000, 'M. Fotso', '2026-10-14T17:02:00.000Z'],
    ]);
    expect((await appeler('GET', 'fonds_caisse/historique/')).json).toEqual([]);
  });

  it('trace UNE ligne au journal par changement, avec avant et après', async () => {
    await modifier('plafond_dette_client', 3_000);
    expect(traces()).toHaveLength(1);
    expect(traces()[0]).toMatchObject({
      auteur: 'M. Fotso',
      profil: 'proprietaire',
      type: 'parametre',
      texte: 'Paramètre modifié : Plafond de dette par client',
      avant: formatFCFA(2_000),
      apres: formatFCFA(3_000),
    });
    await modifier('relances_jours', ['samedi', 'jeudi', 'lundi']);
    expect(traces()).toHaveLength(2);
    expect(traces()[0]).toMatchObject({ avant: 'jeudi, samedi', apres: 'lundi, jeudi, samedi' });
  });

  it('ne trace ni n’historise une valeur inchangée', async () => {
    const { statut, json } = await modifier('plafond_dette_client', 2_000);
    expect(statut).toBe(200);
    expect(json.modifie_par).toBe('');
    await modifier('relances_jours', ['samedi', 'jeudi']);
    expect(traces()).toHaveLength(0);
    expect((await appeler('GET', 'plafond_dette_client/historique/')).json).toEqual([]);
  });

  it('refuse une valeur invalide en 400, sans rien enregistrer ni tracer', async () => {
    const cas: Array<[string, unknown, string]> = [
      ['plafond_dette_client', -1, 'Valeur attendue entre 0 et ∞.'],
      ['plafond_dette_client', 1.5, 'Nombre entier attendu.'],
      ['plafond_dette_client', '2000', 'Nombre entier attendu.'],
      ['tolerance_inventaire', 101, 'Valeur attendue entre 0 et 100.'],
      ['jour_de_paie', 29, 'Valeur attendue entre 1 et 28.'],
      ['inactivite_comptoir', 7, 'Valeur permise : 1, 5, 10, 15.'],
      ['relances_heure', '25:00', 'Heure attendue au format HH:MM.'],
      ['echeance_dettes', 'demain', 'Jour de la semaine attendu (lundi… dimanche).'],
      ['relances_jours', [], 'Liste non vide de jours de la semaine attendue.'],
      ['plafond_dette_client', undefined, 'Nombre entier attendu.'],
    ];
    for (const [cle, valeur, message] of cas) {
      const { statut, json } = await modifier(cle, valeur);
      expect([statut, json.code, json.valeur]).toEqual([400, 'valeur_invalide', message]);
    }
    expect(valeurDuParametre('plafond_dette_client')).toBe(2_000);
    expect(traces()).toHaveLength(0);
  });

  it('revient aux valeurs par défaut à la réinitialisation', async () => {
    await modifier('plafond_dette_client', 3_000);
    reinitialiserSimulation();
    expect(valeurDuParametre('plafond_dette_client')).toBe(2_000);
  });
});

describe('faux serveur Paramètres : compléments', () => {
  it('refuse l’administrateur avant de chercher la clé (403 et non 404)', async () => {
    memoriserUtilisateurConnecte('admin');
    expect((await modifier('inconnu', 1)).statut).toBe(403);
  });

  it('rejette les booléens pour chaque genre numérique', async () => {
    for (const cle of ['plafond_dette_client', 'tolerance_inventaire', 'inactivite_comptoir']) {
      const { statut, json } = await modifier(cle, true);
      expect(statut).toBe(400);
      expect(json.code).toBe('valeur_invalide');
    }
  });

  it('valeurDuParametre suit une modification, et une liste modifiée reste isolée', async () => {
    expect(valeurDuParametre('seuil_validation_depenses')).toBe(50_000);
    await modifier('seuil_validation_depenses', 60_000);
    expect(valeurDuParametre('seuil_validation_depenses')).toBe(60_000);
    await modifier('controles_stock_jours', ['lundi']);
    valeurDuParametre<string[]>('controles_stock_jours').push('mardi');
    expect(valeurDuParametre<string[]>('controles_stock_jours')).toEqual(['lundi']);
  });
});

describe('faux serveur Paramètres : produits', () => {
  const produits = (id: string) => {
    memoriserUtilisateurConnecte(id);
    const reponse = repondre(new URL(`http://x${RACINE}produits/`), 'GET', {});
    return reponse.json().then((json: any) => ({ statut: reponse.status, json }));
  };

  it('livre le résumé des sept fiches au propriétaire et à l’administrateur', async () => {
    for (const id of ['fotso', 'admin']) {
      const { statut, json } = await produits(id);
      expect(statut).toBe(200);
      expect(json).toHaveLength(7);
      expect(json[0]).toEqual({
        id: 'bag',
        code: 'BAG',
        nom: 'Baguette',
        nomEn: 'Baguette',
        boule: 5000,
        pb: 20,
        painsParSac: 315,
        prix: [100, 110],
      });
      expect(json.find((p: any) => p.id === 'gc170').prix).toBeNull();
    }
  });

  it('refuse les autres profils, et toute méthode autre que GET', async () => {
    for (const id of ['davy', 'willy', 'serge']) {
      const { statut, json } = await produits(id);
      expect([statut, json.code]).toEqual([403, 'droit_insuffisant']);
    }
    memoriserUtilisateurConnecte(null);
    expect((await produits('')).statut).toBe(403);
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('POST', 'produits/')).statut).toBe(405);
  });
});
