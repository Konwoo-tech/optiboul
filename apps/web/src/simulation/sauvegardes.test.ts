import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  InstantaneSauvegardes,
  ReponseCopie,
  ReponseRestauration,
} from '@/espaces/gestion/sauvegardes/types.ts';

import { lireJournal } from './journal.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { lesCopies } from './sauvegardes.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/sauvegardes/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneSauvegardes;
const lignesDuJournal = () => lireJournal().filter((e) => e.type === 'sauvegarde');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('admin');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur Sauvegardes : droits', () => {
  it('refuse sans connexion', async () => {
    memoriserUtilisateurConnecte(null);
    const { statut, json } = await appeler('GET');
    expect([statut, json.code]).toEqual([403, 'non_authentifie']);
  });

  it.each(['davy', 'willy', 'serge', 'fotso'])(
    'refuse le compte %s pour chaque route, sans rien changer',
    async (compte) => {
      memoriserUtilisateurConnecte(compte);
      for (const [methode, chemin] of [
        ['GET', ''],
        ['POST', 'locale/'],
        ['POST', 'cloud/'],
        ['POST', 'C-1/restaurer/'],
      ] as const) {
        const { statut, json } = await appeler(methode, chemin);
        expect([statut, json.code]).toEqual([403, 'droit_insuffisant']);
      }
      expect(lesCopies()).toHaveLength(4);
      expect(lignesDuJournal()).toHaveLength(0);
    },
  );
});

describe('faux serveur Sauvegardes : état de départ (maquette)', () => {
  it('liste les quatre copies de la maquette, la plus récente d’abord', async () => {
    const etat = await lire();
    expect(etat.copies.map((c) => [c.genre, c.instant])).toEqual([
      ['locale', '2026-10-14T20:30:00.000Z'],
      ['locale', '2026-10-14T12:30:00.000Z'],
      ['locale', '2026-10-13T20:30:00.000Z'],
      ['cloud', '2026-10-12T16:52:00.000Z'],
    ]);
    expect(etat.derniereLocale).toBe('2026-10-14T20:30:00.000Z');
    expect(etat.derniereCloud).toBe('2026-10-12T16:52:00.000Z');
    expect(etat.seuilAlerteHeures).toBe(48);
  });

  it('signale la copie cloud en retard (plus de 48 h)', async () => {
    expect((await lire()).cloudEnRetard).toBe(true);
  });
});

describe('faux serveur Sauvegardes : sauvegarder maintenant', () => {
  it('crée une copie locale manuelle à l’instant présent', async () => {
    const { statut, json } = await appeler('POST', 'locale/');
    const rep = json as unknown as ReponseCopie;
    expect(statut).toBe(201);
    expect(rep.copie).toMatchObject({
      genre: 'locale',
      declencheur: 'manuelle',
      instant: '2026-10-14T17:02:00.000Z',
    });
    expect(rep.instantane.copies[0]).toEqual(rep.copie);
    expect(rep.instantane.copies).toHaveLength(5);
    expect(rep.instantane.derniereLocale).toBe('2026-10-14T17:02:00.000Z');
    expect(rep.instantane.cloudEnRetard).toBe(true);
  });

  it('une copie cloud rend l’état « À jour »', async () => {
    const { statut, json } = await appeler('POST', 'cloud/');
    const rep = json as unknown as ReponseCopie;
    expect(statut).toBe(201);
    expect(rep.copie.genre).toBe('cloud');
    expect(rep.instantane.derniereCloud).toBe('2026-10-14T17:02:00.000Z');
    expect(rep.instantane.cloudEnRetard).toBe(false);
  });

  it('l’état redevient « en retard » après 48 h', async () => {
    await appeler('POST', 'cloud/');
    vi.setSystemTime(new Date('2026-10-16T17:02:01Z'));
    expect((await lire()).cloudEnRetard).toBe(true);
  });

  it('chaque copie reçoit un identifiant distinct', async () => {
    await appeler('POST', 'locale/');
    await appeler('POST', 'locale/');
    const ids = (await lire()).copies.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('consigne une seule ligne par action dans le journal', async () => {
    await appeler('POST', 'locale/');
    await appeler('POST', 'cloud/');
    const lignes = lignesDuJournal();
    expect(lignes.map((e) => e.texte)).toEqual(['Sauvegarde cloud', 'Sauvegarde locale']);
    expect(lignes[0]).toMatchObject({ profil: 'administrateur' });
  });
});

describe('faux serveur Sauvegardes : restauration guidée', () => {
  it('copie d’abord l’état actuel, restaure puis contrôle les totaux', async () => {
    const { statut, json } = await appeler('POST', 'C-2/restaurer/');
    const rep = json as unknown as ReponseRestauration;
    expect(statut).toBe(200);
    expect(rep.restauration.copie.id).toBe('C-2');
    expect(rep.restauration.copieAvant).toMatchObject({
      genre: 'locale',
      declencheur: 'avant_restauration',
      instant: '2026-10-14T17:02:00.000Z',
    });
    expect(rep.restauration.controles).toEqual([
      { cle: 'sessions', ok: true },
      { cle: 'soldes_clients', ok: true },
      { cle: 'stocks', ok: true },
    ]);
    expect(rep.instantane.copies[0]).toEqual(rep.restauration.copieAvant);
    expect(rep.instantane.copies).toHaveLength(5);
  });

  it('peut restaurer une copie cloud', async () => {
    expect((await appeler('POST', 'C-4/restaurer/')).statut).toBe(200);
  });

  it('refuse une copie inconnue (404) sans rien créer', async () => {
    const { statut, json } = await appeler('POST', 'C-99/restaurer/');
    expect([statut, json.code]).toEqual([404, 'copie_inconnue']);
    expect(lesCopies()).toHaveLength(4);
    expect(lignesDuJournal()).toHaveLength(0);
  });

  it('consigne une seule ligne, avec la date de la copie restaurée', async () => {
    await appeler('POST', 'C-2/restaurer/');
    expect(lignesDuJournal().map((e) => e.texte)).toEqual([
      'Restauration de la copie du 14 oct. 13:30',
    ]);
  });

  it('ne supprime ni ne modifie aucune copie existante (ajout seul)', async () => {
    const avant = (await lire()).copies;
    await appeler('POST', 'C-2/restaurer/');
    const apres = (await lire()).copies;
    expect(apres.slice(1)).toEqual(avant);
  });
});

describe('faux serveur Sauvegardes : routes inconnues', () => {
  it('ne répond pas aux méthodes ou chemins qui ne sont pas les siens', async () => {
    for (const [methode, chemin] of [
      ['DELETE', 'C-1/'],
      ['PUT', 'locale/'],
      ['GET', 'cloud/'],
      ['POST', 'C-1/supprimer/'],
    ] as const) {
      expect((await appeler(methode, chemin)).json.code).toBe('non_simule');
    }
    expect(lesCopies()).toHaveLength(4);
  });
});
