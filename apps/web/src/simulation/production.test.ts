import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneProduction } from '@/espaces/atelier/production/types.ts';

import { repondre, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import { journalProduction, placerLeCycle } from './production.ts';
import { mouvementsDeStock, stockDesMatieres } from './stocks.ts';

const RACINE = '/api/v1/simulation/atelier/production/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  return { statut: reponse.status, json: (await reponse.json()) as Record<string, any> };
}
const lire = async () => (await appeler('GET')).json as unknown as InstantaneProduction;

const REALISE = { BAG: 940, KO: 760, GC: 100 };
const JUSTE = {
  farine: 300,
  sel: 3600,
  levure: 2700,
  ameliorant: 1800,
  glace: 30,
  bois: 1,
  huile: 3,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
});
afterEach(() => vi.useRealTimers());

describe('faux serveur de la production : accès', () => {
  it('refuse sans connexion (403) et à la caissière ou à l’administrateur', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET')).statut).toBe(403);
    for (const id of ['davy', 'admin']) {
      memoriserUtilisateurConnecte(id);
      const reponse = await appeler('GET');
      expect(reponse.statut).toBe(403);
      expect(reponse.json.code).toBe('droit_insuffisant');
    }
  });

  it('renvoie l’état de départ de la maquette : en cours, 6 sacs, 2 013 pains', async () => {
    memoriserUtilisateurConnecte('serge');
    const p = await lire();
    expect(p.etape).toBe('en-cours');
    expect(p.plan.sacs).toBe(6);
    expect(p.plan.prevus).toBe(2013);
    expect(p.demande.BAG.besoin).toBe(1);
    expect(p.planValide).toEqual({ par: 'Willy', a: '17:42' });
    expect(p.historique).toHaveLength(5);
    expect(p.stock.farine).toBe(30);
  });

  it('route inconnue : pas encore simulée (404)', async () => {
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('GET', 'inconnue/')).statut).toBe(404);
  });
});

describe('faux serveur de la production : cycle', () => {
  it('propose, valide, ouvre : chaque étape à sa bonne personne', async () => {
    placerLeCycle('commandes');
    memoriserUtilisateurConnecte('willy');
    expect((await appeler('POST', 'plan/proposer/')).statut).toBe(403);
    memoriserUtilisateurConnecte('ignace');
    expect((await appeler('POST', 'plan/proposer/')).statut).toBe(403);
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('POST', 'plan/valider/')).statut).toBe(409);
    expect((await appeler('POST', 'plan/proposer/')).statut).toBe(200);
    expect((await appeler('POST', 'plan/proposer/')).statut).toBe(409);
    expect((await appeler('POST', 'plan/valider/')).statut).toBe(403);
    memoriserUtilisateurConnecte('patrick');
    expect((await appeler('POST', 'plan/valider/')).statut).toBe(403);
    memoriserUtilisateurConnecte('willy');
    const valide = await appeler('POST', 'plan/valider/');
    expect(valide.statut).toBe(200);
    expect(valide.json.instantane.planValide.par).toBe('Willy');
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('POST', 'ouvrir/')).json.instantane.etape).toBe('en-cours');
    expect(journalProduction().map((l) => l.quoi)).toHaveLength(3);
  });

  it('le propriétaire peut valider le plan', async () => {
    placerLeCycle('plan-propose');
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('POST', 'plan/valider/')).statut).toBe(200);
  });
});

describe('faux serveur de la production : saisie et clôture', () => {
  beforeEach(() => memoriserUtilisateurConnecte('serge'));

  it('la saisie est fermée hors production (409) et au gérant (403)', async () => {
    placerLeCycle('plan-valide');
    expect((await appeler('PUT', 'realise/', REALISE)).statut).toBe(409);
    placerLeCycle('en-cours');
    memoriserUtilisateurConnecte('willy');
    expect((await appeler('PUT', 'realise/', REALISE)).statut).toBe(403);
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('PUT', 'realise/', { BAG: -1 })).statut).toBe(400);
    expect((await appeler('PUT', 'realise/', REALISE)).json.instantane.realise).toEqual(REALISE);
  });

  it('refuse la clôture sans réalisé ni consommation (R5)', async () => {
    const sans = await appeler('POST', 'cloturer/', { realise: { BAG: 1 }, consommation: JUSTE });
    expect(sans.statut).toBe(409);
    expect(sans.json.code).toBe('realise_requis');
    const sansConso = await appeler('POST', 'cloturer/', { realise: REALISE, consommation: {} });
    expect(sansConso.json.code).toBe('consommation_requise');
    expect((await lire()).etape).toBe('en-cours');
  });

  it('clôture : sorties de stock, historique, plus de saisie', async () => {
    const avant = mouvementsDeStock().length;
    const reponse = await appeler('POST', 'cloturer/', { realise: REALISE, consommation: JUSTE });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.sorties).toHaveLength(7);
    expect(stockDesMatieres().farine).toBe(24);
    expect(stockDesMatieres().levure).toBeCloseTo(0, 5);
    expect(mouvementsDeStock().length - avant).toBe(7);
    const p = reponse.json.instantane as InstantaneProduction;
    expect(p.etape).toBe('cloturee');
    const derniere = p.historique.at(-1)!;
    expect(derniere).toMatchObject({ realise: 1800, prevus: 2013, statut: 'cloturee' });
    expect((await appeler('PUT', 'realise/', REALISE)).statut).toBe(409);
    expect(
      (await appeler('POST', 'cloturer/', { realise: REALISE, consommation: JUSTE })).statut,
    ).toBe(409);
  });

  it('justification : seulement en cas d’écart au-delà du seuil, motif obligatoire', async () => {
    const pasEcart = await appeler('POST', 'justification/', {
      motif: 'perte',
      consommation: JUSTE,
    });
    expect(pasEcart.statut).toBe(409);
    const enEcart = { ...JUSTE, farine: 320 };
    expect((await appeler('POST', 'justification/', { consommation: enEcart })).statut).toBe(400);
    const ok = await appeler('POST', 'justification/', {
      motif: 'brule',
      texte: 'Four 2',
      consommation: enEcart,
    });
    expect(ok.statut).toBe(200);
    expect(ok.json.instantane.justification).toEqual({ motif: 'brule', texte: 'Four 2' });
  });
});

describe('faux serveur de la production : supplément (R15)', () => {
  beforeEach(() => memoriserUtilisateurConnecte('serge'));

  it('avant la validation, le supplément s’ajoute au plan', async () => {
    placerLeCycle('commandes');
    const reponse = await appeler('POST', 'supplement/', {
      sacs: { BAG: 1, KO: 0, GC: 0 },
      motif: 'habituels',
    });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.instantane.plan.sacs).toBe(7);
  });

  it('valide les entrées : au moins un sac, motif, 0 à 10 par produit', async () => {
    expect((await appeler('POST', 'supplement/', { sacs: {}, motif: 'guichet' })).json.code).toBe(
      'supplement_vide',
    );
    expect((await appeler('POST', 'supplement/', { sacs: { BAG: 1 } })).json.code).toBe(
      'motif_obligatoire',
    );
    expect(
      (await appeler('POST', 'supplement/', { sacs: { BAG: 11 }, motif: 'guichet' })).json.code,
    ).toBe('supplement_invalide');
  });

  it('après la validation, une demande part au gérant ; accordée, elle s’ajoute au plan', async () => {
    const envoi = await appeler('POST', 'supplement/', { sacs: { BAG: 1 }, motif: 'habituels' });
    expect(envoi.statut).toBe(200);
    expect(envoi.json.instantane.plan.sacs).toBe(6);
    expect(envoi.json.instantane.demandeEnAttente.total).toBe(1);
    // Une seule demande à la fois.
    expect(
      (await appeler('POST', 'supplement/', { sacs: { KO: 1 }, motif: 'guichet' })).statut,
    ).toBe(409);

    memoriserUtilisateurConnecte('willy');
    const demandes = repondre(new URL('http://x/api/v1/simulation/demandes/'), 'GET', {});
    const liste = (await demandes.json()) as { demandes: Array<{ id: string; type: string }> };
    const production = liste.demandes.find((d) => d.type === 'production')!;
    const decision = repondre(
      new URL(`http://x/api/v1/simulation/demandes/${production.id}/decider/`),
      'POST',
      { accord: true },
    );
    expect(decision.status).toBe(200);
    const p = await lire();
    expect(p.plan.sacs).toBe(7);
    expect(p.demandeEnAttente).toBeNull();
  });

  it('une demande refusée n’ajoute rien', async () => {
    await appeler('POST', 'supplement/', { sacs: { BAG: 1 }, motif: 'marche' });
    memoriserUtilisateurConnecte('fotso');
    const liste = (await repondre(
      new URL('http://x/api/v1/simulation/demandes/'),
      'GET',
      {},
    ).json()) as {
      demandes: Array<{ id: string; type: string }>;
    };
    const id = liste.demandes.find((d) => d.type === 'production')!.id;
    repondre(new URL(`http://x/api/v1/simulation/demandes/${id}/decider/`), 'POST', {
      accord: false,
    });
    expect((await lire()).plan.sacs).toBe(6);
  });

  it('seul le responsable ajuste (403)', async () => {
    memoriserUtilisateurConnecte('willy');
    expect(
      (await appeler('POST', 'supplement/', { sacs: { BAG: 1 }, motif: 'guichet' })).statut,
    ).toBe(403);
  });
});

describe('faux serveur de la production : session suivante et fiches', () => {
  it('une production non clôturée est archivée « non clôturée » à l’ouverture de la session suivante', async () => {
    // La production s'abonne à la session au premier appel : on l'ouvre d'abord.
    memoriserUtilisateurConnecte('willy');
    await lire();
    memoriserUtilisateurConnecte('davy');
    const comptoir = '/api/v1/simulation/comptoir/session/';
    repondre(new URL(`http://x${comptoir}comptage/`), 'PUT', { especes: '1000' });
    repondre(new URL(`http://x${comptoir}cloturer/`), 'POST', {});
    repondre(new URL(`http://x${comptoir}ouvrir-suivante/`), 'POST', {});
    memoriserUtilisateurConnecte('willy');
    const p = await lire();
    expect(p.etape).toBe('commandes');
    expect(p.historique.at(-1)).toMatchObject({ statut: 'non-cloturee', realise: null });
    expect(p.session).toEqual({ type: 'jour', date: '2026-10-15' });
  });

  it('le propriétaire modifie une fiche : nouvelle version ; les autres profils lisent seulement', async () => {
    memoriserUtilisateurConnecte('serge');
    const lecture = await appeler('GET', 'fiches/');
    expect(lecture.json.fiches).toHaveLength(7);
    const recette = { ...lecture.json.fiches[0].recette, farine: 51 };
    expect((await appeler('PUT', 'fiches/bag/', recette)).statut).toBe(403);
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('PUT', 'fiches/inconnu/', recette)).statut).toBe(404);
    expect((await appeler('PUT', 'fiches/bag/', { ...recette, sel: 0 })).statut).toBe(400);
    const ok = await appeler('PUT', 'fiches/bag/', recette);
    expect(ok.statut).toBe(200);
    expect(ok.json.fiche).toMatchObject({ version: 4, modifiePar: 'M. Fotso' });
  });
});

describe('stock partagé avec les dépenses', () => {
  it('une dépense rattachée au stock entre en stock ; la clôture sort la consommation', async () => {
    memoriserUtilisateurConnecte('davy');
    const reponse = repondre(new URL('http://x/api/v1/simulation/comptoir/depenses/'), 'POST', {
      categorie: 'matieres',
      libelle: 'Levure – 1 carton',
      montant: 20000,
      mode: 'caisse',
      photo: true,
      rattachement: 'stock',
      matiere: 'levure',
      quantite: 5,
    });
    expect(reponse.status).toBe(200);
    expect(stockDesMatieres().levure).toBeCloseTo(7.7, 5);
    memoriserUtilisateurConnecte('serge');
    await appeler('POST', 'cloturer/', { realise: REALISE, consommation: JUSTE });
    expect(stockDesMatieres().levure).toBeCloseTo(5, 5);
  });
});
