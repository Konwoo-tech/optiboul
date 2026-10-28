import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneSemaines } from '@/espaces/gestion/semaines/types.ts';

import { repondre, reinitialiserSimulation } from './routeur.ts';
import { journalSemaines } from './semaines.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/semaines/';

async function appeler(
  methode: string,
  chemin = '',
  corps: Record<string, unknown> = {},
  racine = RACINE,
) {
  const reponse = repondre(new URL(`http://x${racine}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneSemaines;
const semaine = async (id: string) => (await lire()).semaines.find((s) => s.id === id)!;

/** Ferme la caisse et la session, ouvre et ferme la suivante (la production non clôturée est archivée). */
async function toutFermer() {
  const session = '/api/v1/simulation/comptoir/session/';
  const caisses = '/api/v1/simulation/caisses/';
  memoriserUtilisateurConnecte('willy');
  // Lire les semaines abonne la production à l'ouverture de la session suivante.
  await appeler('GET');
  for (const tour of [1, 2]) {
    await appeler('PUT', 'comptage/', { especes: '22450' }, session);
    await appeler('POST', 'cloturer/', {}, session);
    await appeler('POST', 'fermer/', { compte: 22450 }, caisses);
    if (tour === 1) {
      await appeler('POST', 'ouvrir/', { fonds: 20000 }, caisses);
      await appeler('POST', 'ouvrir-suivante/', {}, session);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur des semaines : accès', () => {
  it('refuse sans connexion (403)', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET')).statut).toBe(403);
  });

  it('refuse à la caissière et à l’administrateur', async () => {
    for (const id of ['davy', 'admin']) {
      memoriserUtilisateurConnecte(id);
      const reponse = await appeler('GET');
      expect(reponse.statut).toBe(403);
      expect(reponse.json.code).toBe('droit_insuffisant');
    }
  });

  it('le gérant, le propriétaire et le responsable de production lisent', async () => {
    for (const id of ['willy', 'fotso', 'serge']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('GET')).statut).toBe(200);
    }
  });
});

describe('faux serveur des semaines : lecture', () => {
  it('donne les quatre semaines de la maquette et le gérant et le responsable', async () => {
    const { semaines } = await lire();
    expect(
      semaines.map((s) => [s.numero, s.statut, s.gerant?.nom ?? '', s.production?.nom ?? '']),
    ).toEqual([
      [41, 'cloturee', 'Patrick', 'Serge'],
      [42, 'ouverte', 'Willy', 'Serge'],
      [43, 'planifiee', 'Patrick', 'Ignace'],
      [44, 'planifiee', '', ''],
    ]);
  });

  it('calcule les chiffres de la semaine 42 depuis les caisses, les dépenses et la production', async () => {
    const { indicateurs } = await lire();
    expect(indicateurs.S42).toEqual({
      recette: 1_237_050,
      depenses: { nombre: 4, montant: 116_000 },
      productions: { nombre: 6, sacs: 41 },
      ecartCumule: 0,
      caisses: 6,
      receptions: 6,
    });
    expect(indicateurs.S41!.recette).toBe(2_214_600);
  });

  it('les contrôles bloquent tant que la caisse et la production sont ouvertes', async () => {
    const { clotures } = await lire();
    const { controles, passation } = clotures.S42!;
    expect(controles.map((c) => [c.cle, c.niveau])).toEqual([
      ['caisse', 'bloquant'],
      ['production', 'bloquant'],
      ['dettes', 'surveiller'],
      ['factures', 'surveiller'],
      ['demandes', 'surveiller'],
    ]);
    expect(Object.keys(clotures)).toEqual(['S42']);
    expect(passation.destinataire?.nom).toBe('Patrick');
    expect(passation.dettes).toEqual({ clients: -14_050, fournisseurs: 2_334_900 });
    expect(passation.stockBas).toEqual([]);
  });
});

describe('faux serveur des semaines : affectations', () => {
  it('seul le propriétaire affecte (403 pour le gérant)', async () => {
    const reponse = await appeler('POST', 'affectations/', {
      semaine: 'S44',
      role: 'gerant',
      personne: 'christelle',
    });
    expect(reponse.statut).toBe(403);
  });

  it('le propriétaire affecte un gérant et un responsable à une semaine planifiée', async () => {
    memoriserUtilisateurConnecte('fotso');
    await appeler('POST', 'affectations/', {
      semaine: 'S44',
      role: 'gerant',
      personne: 'christelle',
    });
    const reponse = await appeler('POST', 'affectations/', {
      semaine: 'S44',
      role: 'production',
      personne: 'ignace',
    });
    expect(reponse.statut).toBe(200);
    const s44 = await semaine('S44');
    expect([s44.gerant?.nom, s44.production?.nom, s44.planifieePar]).toEqual([
      'Christelle',
      'Ignace',
      'M. Fotso',
    ]);
    expect(journalSemaines()[0]!.quoi).toContain('responsable de production → Ignace');
  });

  it('refuse une semaine ouverte (409), une semaine inconnue (404) et la mauvaise personne (400)', async () => {
    memoriserUtilisateurConnecte('fotso');
    const base = { role: 'gerant', personne: 'patrick' };
    expect((await appeler('POST', 'affectations/', { ...base, semaine: 'S42' })).statut).toBe(409);
    expect((await appeler('POST', 'affectations/', { ...base, semaine: 'S99' })).statut).toBe(404);
    const faux = await appeler('POST', 'affectations/', {
      semaine: 'S44',
      role: 'gerant',
      personne: 'serge',
    });
    expect(faux.statut).toBe(400);
    expect(faux.json.code).toBe('personne_invalide');
  });
});

describe('faux serveur des semaines : planning des caisses', () => {
  const creneau = { semaine: 'S42', jour: '2026-10-15', creneau: 'jour', caissiere: 'davy' };

  it('le gérant de la semaine planifie un créneau à venir, et la caisse le voit', async () => {
    const reponse = await appeler('POST', 'planning/', creneau);
    expect(reponse.statut).toBe(200);
    expect((reponse.json as unknown as InstantaneSemaines).planning.S42!['2026-10-15']!.jour).toBe(
      'davy',
    );
    const caisses = await appeler('GET', '', {}, '/api/v1/simulation/caisses/');
    expect(caisses.json.prochaine.jour).toBe('2026-10-15');
    expect(caisses.json.prochaine.planifiee).toEqual({ id: 'davy', nom: 'Davy' });
  });

  it('un autre gérant et le responsable de production ne planifient pas (403)', async () => {
    for (const id of ['patrick', 'serge']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('POST', 'planning/', creneau)).statut).toBe(403);
    }
  });

  it('refuse un créneau qui a déjà sa caisse (409), un jour hors semaine (400), une semaine clôturée (409)', async () => {
    const passe = await appeler('POST', 'planning/', { ...creneau, jour: '2026-10-12' });
    expect(passe.json.code).toBe('creneau_passe');
    expect((await appeler('POST', 'planning/', { ...creneau, jour: '2026-10-20' })).statut).toBe(
      400,
    );
    memoriserUtilisateurConnecte('fotso');
    const cloturee = await appeler('POST', 'planning/', {
      ...creneau,
      semaine: 'S41',
      jour: '2026-10-06',
    });
    expect(cloturee.statut).toBe(409);
    expect((await appeler('POST', 'planning/', { ...creneau, caissiere: 'willy' })).statut).toBe(
      400,
    );
  });
});

describe('faux serveur des semaines : ouverture et clôture', () => {
  it('refuse de clôturer tant qu’une caisse ou une production est ouverte (409)', async () => {
    const reponse = await appeler('POST', 'cloturer/', { semaine: 'S42' });
    expect(reponse.statut).toBe(409);
    expect(reponse.json.code).toBe('controles_bloquants');
    expect((await semaine('S42')).statut).toBe('ouverte');
  });

  it('seul le gérant de la semaine ou le propriétaire clôture (403)', async () => {
    memoriserUtilisateurConnecte('patrick');
    expect((await appeler('POST', 'cloturer/', { semaine: 'S42' })).statut).toBe(403);
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('POST', 'cloturer/', { semaine: 'S42' })).statut).toBe(403);
  });

  it('clôture une fois tout fermé, trace la passation et suit dans le contexte', async () => {
    await toutFermer();
    const { clotures } = await lire();
    expect(clotures.S42!.controles.slice(0, 2).map((c) => c.niveau)).toEqual(['ok', 'ok']);
    const reponse = await appeler('POST', 'cloturer/', { semaine: 'S42' });
    expect(reponse.statut).toBe(200);
    const s42 = await semaine('S42');
    expect([s42.statut, s42.cloture?.par, s42.cloture?.heure]).toEqual([
      'cloturee',
      'Willy',
      '18:02',
    ]);
    expect(journalSemaines()[0]!.quoi).toBe('Clôture de la semaine 42 · passation à Patrick');
    expect((await appeler('POST', 'cloturer/', { semaine: 'S42' })).statut).toBe(409);
  });

  it('n’ouvre pas une semaine tant que la précédente est ouverte, puis l’ouvre', async () => {
    memoriserUtilisateurConnecte('fotso');
    const trop = await appeler('POST', 'ouvrir/', { semaine: 'S43' });
    expect([trop.statut, trop.json.raison]).toEqual([409, 'autreOuverte']);
    await toutFermer();
    memoriserUtilisateurConnecte('fotso');
    await appeler('POST', 'cloturer/', { semaine: 'S42' });
    expect((await appeler('POST', 'ouvrir/', { semaine: 'S44' })).json.raison).toBe('affecter');
    const ouverte = await appeler('POST', 'ouvrir/', { semaine: 'S43' });
    expect(ouverte.statut).toBe(200);
    const s43 = await semaine('S43');
    expect([s43.statut, s43.ouverture?.par]).toEqual(['ouverte', 'M. Fotso']);
    const contexte = await appeler('GET', '', {}, '/api/v1/simulation/contexte/');
    expect([contexte.json.semaine.numero, contexte.json.gerantDeLaSemaine]).toEqual([
      43,
      'Patrick',
    ]);
  });

  it('l’ouverture est réservée au propriétaire et au gérant affecté (403)', async () => {
    await toutFermer();
    memoriserUtilisateurConnecte('fotso');
    await appeler('POST', 'cloturer/', { semaine: 'S42' });
    for (const id of ['willy', 'serge']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('POST', 'ouvrir/', { semaine: 'S43' })).statut).toBe(403);
    }
    memoriserUtilisateurConnecte('patrick');
    expect((await appeler('POST', 'ouvrir/', { semaine: 'S43' })).statut).toBe(200);
  });
});

describe('faux serveur des semaines : enchaînement avec les autres écrans', () => {
  it('après clôture de S42 et ouverture de S43, dépenses et production suivent la nouvelle semaine', async () => {
    await toutFermer();
    memoriserUtilisateurConnecte('fotso');
    await appeler('POST', 'cloturer/', { semaine: 'S42' });
    await appeler('POST', 'ouvrir/', { semaine: 'S43' });

    memoriserUtilisateurConnecte('patrick');
    const depenses = '/api/v1/simulation/comptoir/depenses/';
    const avant = await appeler('GET', '', {}, depenses);
    expect(avant.json.semaineCourante.id).toBe('S43');
    expect(avant.json.gerantDeLaSemaine).toBe('Patrick');
    const saisie = await appeler(
      'POST',
      '',
      {
        categorie: 'technique',
        libelle: 'Joint de porte',
        montant: 8000,
        mode: 'banque',
        photo: true,
        rattachement: 'semaine',
      },
      depenses,
    );
    expect(saisie.statut).toBe(200);
    expect(saisie.json.depense.semaine).toBe('S43');

    const production = await appeler('GET', '', {}, '/api/v1/simulation/atelier/production/');
    expect(production.json.semaine.numero).toBe(43);
    expect([production.json.gerant, production.json.responsable]).toEqual(['Patrick', 'Ignace']);
  });
});
