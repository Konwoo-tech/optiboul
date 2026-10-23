import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneStocks } from '@/espaces/atelier/stocks/types.ts';

import { repondre, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import {
  controleDeStockAFaire,
  journalStocks,
  mouvementsDeStock,
  sortirDuStockDepuisProduction,
} from './stocks.ts';

const RACINE = '/api/v1/simulation/atelier/stocks/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  return { statut: reponse.status, json: (await reponse.json()) as Record<string, any> };
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneStocks;
const stockDe = async (cle: string) => (await lire()).matieres.find((m) => m.cle === cle)!.stock;

const COMPTAGE_PROCHE = {
  farine: 30,
  sel: 14.4,
  levure: 2.7,
  ameliorant: 7.2,
  glace: 118,
  bois: 4,
  huile: 20,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
});
afterEach(() => vi.useRealTimers());

describe('faux serveur des stocks : accès', () => {
  it('refuse sans connexion (403)', async () => {
    memoriserUtilisateurConnecte(null);
    const reponse = await appeler('GET');
    expect(reponse.statut).toBe(403);
    expect(reponse.json.code).toBe('non_authentifie');
  });

  it('refuse à la caissière et à l’administrateur (403), lecture comme écriture', async () => {
    for (const id of ['davy', 'admin']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('GET')).statut).toBe(403);
      expect(
        (
          await appeler('POST', 'mouvements/', {
            type: 'perte',
            matiere: 'farine',
            quantite: 1,
            motif: 'x',
          })
        ).statut,
      ).toBe(403);
      expect((await appeler('POST', 'inventaires/', { comptages: COMPTAGE_PROCHE })).statut).toBe(
        403,
      );
    }
  });

  it('le propriétaire lit mais ne saisit ni mouvement ni inventaire (403)', async () => {
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('GET')).statut).toBe(200);
    const mouvement = await appeler('POST', 'mouvements/', {
      type: 'perte',
      matiere: 'farine',
      quantite: 1,
      motif: 'Casse',
    });
    expect(mouvement.statut).toBe(403);
    expect(mouvement.json.code).toBe('droit_insuffisant');
    expect((await appeler('POST', 'inventaires/', { comptages: COMPTAGE_PROCHE })).statut).toBe(
      403,
    );
    expect(await stockDe('farine')).toBe(30);
  });

  it('une route inconnue répond 404 « pas encore simulé »', async () => {
    memoriserUtilisateurConnecte('willy');
    const reponse = await appeler('GET', 'inconnue/');
    expect(reponse.statut).toBe(404);
  });
});

describe('faux serveur des stocks : lecture', () => {
  it('renvoie le stock de la maquette, les seize mouvements et les deux inventaires', async () => {
    memoriserUtilisateurConnecte('serge');
    const instantane = await lire();
    expect(instantane.aujourdhui).toBe('2026-10-14');
    expect(instantane.sacsParSession).toBe(6);
    expect(instantane.matieres.map((m) => [m.cle, m.stock, m.besoin])).toEqual([
      ['farine', 30, 6],
      ['sel', 14.4, 3.6],
      ['levure', 2.7, 2.7],
      ['ameliorant', 7.2, 1.8],
      ['glace', 120, 30],
      ['bois', 4, 1],
      ['huile', 20, 3],
    ]);
    expect(instantane.mouvements).toHaveLength(16);
    expect(instantane.inventaires.map((i) => i.id)).toEqual(['AUD-06', 'AUD-07']);
    expect(instantane.receptions.map((r) => [r.matiere, r.jour])).toEqual([
      ['levure', '2026-10-14'],
      ['farine', '2026-10-15'],
      ['bois', '2026-10-16'],
      ['huile', '2026-10-19'],
    ]);
  });

  it('les contrôles : mercredi et dimanche de la semaine précédente puis de la courante', async () => {
    memoriserUtilisateurConnecte('willy');
    const { controles } = await lire();
    expect(controles.map((c) => [c.semaine, c.jour, c.moment, c.gerant])).toEqual([
      [41, '2026-10-07', 'mercredi', 'Patrick'],
      [41, '2026-10-11', 'dimanche', 'Patrick'],
      [42, '2026-10-14', 'mercredi', 'Willy'],
      [42, '2026-10-18', 'dimanche', 'Willy'],
    ]);
  });

  it('l’inventaire du dimanche est recalé sur le stock actuel (comme la maquette)', async () => {
    memoriserUtilisateurConnecte('willy');
    const aud07 = (await lire()).inventaires[1]!;
    const compte = (cle: string) => aud07.lignes.find((l) => l.matiere === cle)!;
    expect(compte('farine').compte).toBe(21);
    expect(compte('levure').compte).toBe(7.7);
    expect(compte('sel')).toMatchObject({ compte: 14.4, theorique: 15.2 });
  });
});

describe('faux serveur des stocks : mouvement manuel', () => {
  beforeEach(() => memoriserUtilisateurConnecte('willy'));

  const saisie = { type: 'perte', matiere: 'farine', quantite: 2, motif: 'Sacs mouillés' };

  it('une perte retire du stock, crée le mouvement et est tracée', async () => {
    const { statut, json } = await appeler('POST', 'mouvements/', saisie);
    expect(statut).toBe(200);
    expect(await stockDe('farine')).toBe(28);
    expect(mouvementsDeStock()[0]).toMatchObject({
      type: 'perte',
      quantite: 2,
      par: 'Willy',
      origine: { genre: 'manuel', motif: 'Sacs mouillés' },
    });
    expect(json.instantane.mouvements).toHaveLength(17);
    expect(journalStocks()[0]!.quoi).toContain('perte 2 farine');
  });

  it('une entrée de correction ajoute au stock, y compris par le chef de production', async () => {
    memoriserUtilisateurConnecte('serge');
    await appeler('POST', 'mouvements/', {
      ...saisie,
      type: 'entree',
      matiere: 'sel',
      quantite: 1.5,
    });
    expect(await stockDe('sel')).toBe(15.9);
  });

  it('refuse les saisies incomplètes (400) : motif obligatoire', async () => {
    const code = async (corps: Record<string, unknown>) =>
      (await appeler('POST', 'mouvements/', corps)).json.code;
    expect(await code({ ...saisie, motif: '   ' })).toBe('motif_obligatoire');
    expect(await code({ ...saisie, quantite: 0 })).toBe('quantite_obligatoire');
    expect(await code({ ...saisie, quantite: '2' })).toBe('quantite_obligatoire');
    expect(await code({ ...saisie, matiere: 'sucre' })).toBe('matiere_inconnue');
    expect(await code({ ...saisie, type: 'sortie' })).toBe('type_inconnu');
    expect(await stockDe('farine')).toBe(30);
  });

  it('refuse une perte plus grande que le stock (409) mais accepte la perte du stock entier', async () => {
    const trop = await appeler('POST', 'mouvements/', { ...saisie, quantite: 30.5 });
    expect(trop.statut).toBe(409);
    expect(trop.json.code).toBe('stock_insuffisant');
    expect((await appeler('POST', 'mouvements/', { ...saisie, quantite: 30 })).statut).toBe(200);
    expect(await stockDe('farine')).toBe(0);
  });
});

describe('faux serveur des stocks : inventaire', () => {
  beforeEach(() => memoriserUtilisateurConnecte('willy'));

  it('un écart sous 5 % est validé tout de suite et ajuste le stock', async () => {
    const { statut, json } = await appeler('POST', 'inventaires/', { comptages: COMPTAGE_PROCHE });
    expect(statut).toBe(200);
    expect(json.inventaire).toMatchObject({ id: 'AUD-08', statut: 'valide', validePar: 'Willy' });
    expect(json.demande).toBeUndefined();
    expect(await stockDe('glace')).toBe(118);
    expect(mouvementsDeStock()[0]).toMatchObject({
      type: 'ajustement',
      matiere: 'glace',
      quantite: -2,
      origine: { genre: 'inventaire', code: 'AUD-08' },
    });
    expect(journalStocks()[0]!.quoi).toBe('Inventaire AUD-08 validé · stock ajusté');
  });

  it('un écart au-delà de 5 % attend le propriétaire : demande DEM-022, stock inchangé', async () => {
    const { json } = await appeler('POST', 'inventaires/', {
      comptages: { ...COMPTAGE_PROCHE, farine: 27, glace: 120 },
    });
    expect(json.inventaire).toMatchObject({
      statut: 'a-valider',
      validePar: '',
      demandeNumero: 22,
    });
    expect(await stockDe('farine')).toBe(30);
    // La demande apparaît dans l'écran des demandes, à valider par le propriétaire.
    const demandes = await (repondre(
      new URL('http://x/api/v1/simulation/demandes/'),
      'GET',
      {},
    ).json() as Promise<any>);
    const demande = demandes.demandes.find((d: any) => d.type === 'inventaire');
    expect(demande).toMatchObject({ numero: 22, statut: 'en-attente', par: 'Willy' });
    expect(demande.objet).toEqual({ genre: 'inventaire', code: 'AUD-08' });
  });

  it('5 % pile est ajusté tout de suite ; un cheveu au-delà attend le propriétaire', async () => {
    const pile = await appeler('POST', 'inventaires/', {
      comptages: { ...COMPTAGE_PROCHE, farine: 28.5 },
    });
    expect(pile.json.inventaire.statut).toBe('valide');
    expect(await stockDe('farine')).toBe(28.5);
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('willy');
    const audela = await appeler('POST', 'inventaires/', {
      comptages: { ...COMPTAGE_PROCHE, farine: 28.4 },
    });
    expect(audela.json.inventaire.statut).toBe('a-valider');
  });

  it('un théorique nul avec de la matière comptée attend le propriétaire', async () => {
    await appeler('POST', 'mouvements/', {
      type: 'perte',
      matiere: 'farine',
      quantite: 30,
      motif: 'x',
    });
    const { json } = await appeler('POST', 'inventaires/', {
      comptages: { ...COMPTAGE_PROCHE, farine: 1 },
    });
    expect(json.inventaire.statut).toBe('a-valider');
  });

  it('refuse un second inventaire tant que le premier attend le propriétaire (409)', async () => {
    await appeler('POST', 'inventaires/', { comptages: { ...COMPTAGE_PROCHE, farine: 27 } });
    const second = await appeler('POST', 'inventaires/', { comptages: COMPTAGE_PROCHE });
    expect(second.statut).toBe(409);
    expect(second.json.code).toBe('inventaire_en_attente');
    expect((await lire()).inventaires).toHaveLength(3);
  });

  it('exige le comptage de toutes les matières (400)', async () => {
    const { farine: _farine, ...incomplet } = COMPTAGE_PROCHE;
    expect((await appeler('POST', 'inventaires/', { comptages: incomplet })).json.code).toBe(
      'comptage_incomplet',
    );
    expect((await appeler('POST', 'inventaires/', {})).json.code).toBe('comptage_incomplet');
    expect(
      (await appeler('POST', 'inventaires/', { comptages: { ...COMPTAGE_PROCHE, sel: -1 } }))
        .statut,
    ).toBe(400);
    expect((await lire()).inventaires).toHaveLength(2);
  });

  it('le comptage fait disparaître le rappel du contrôle du jour', async () => {
    expect(controleDeStockAFaire()).toBe(true);
    await appeler('POST', 'inventaires/', { comptages: COMPTAGE_PROCHE });
    expect(controleDeStockAFaire()).toBe(false);
  });
});

describe('faux serveur des stocks : décision du propriétaire', () => {
  const decider = (id: string, accord: boolean) =>
    repondre(new URL(`http://x/api/v1/simulation/demandes/${id}/decider/`), 'POST', { accord });

  async function inventaireEnAttente() {
    memoriserUtilisateurConnecte('willy');
    await appeler('POST', 'inventaires/', { comptages: { ...COMPTAGE_PROCHE, farine: 27 } });
    return 'q-inv-8';
  }

  it('un accord valide l’inventaire et ajuste le stock sur l’écart compté', async () => {
    const id = await inventaireEnAttente();
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(id, true)).status).toBe(200);
    const instantane = await lire();
    expect(instantane.inventaires.at(-1)).toMatchObject({
      statut: 'valide',
      validePar: 'M. Fotso',
    });
    expect(await stockDe('farine')).toBe(27);
  });

  it('l’ajustement s’applique à l’écart, pas au comptage : un mouvement entre-temps est conservé', async () => {
    const id = await inventaireEnAttente();
    await appeler('POST', 'mouvements/', {
      type: 'perte',
      matiere: 'farine',
      quantite: 1,
      motif: 'Casse',
    });
    memoriserUtilisateurConnecte('fotso');
    await decider(id, true);
    expect(await stockDe('farine')).toBe(26);
  });

  it('un refus ne touche pas au stock', async () => {
    const id = await inventaireEnAttente();
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(id, false)).status).toBe(200);
    expect((await lire()).inventaires.at(-1)).toMatchObject({ statut: 'refuse' });
    expect(await stockDe('farine')).toBe(30);
  });

  it('le gérant ne décide pas (403) et une demande décidée ne l’est qu’une fois (409)', async () => {
    const id = await inventaireEnAttente();
    expect((await decider(id, true)).status).toBe(403);
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(id, true)).status).toBe(200);
    expect((await decider(id, false)).status).toBe(409);
    expect((await decider('q-inv-99', true)).status).toBe(404);
  });
});

describe('faux serveur des stocks : sorties de production', () => {
  it('sortirDuStockDepuisProduction crée une sortie par matière consommée', async () => {
    memoriserUtilisateurConnecte('serge');
    const creees = sortirDuStockDepuisProduction({
      creneau: 'nuit',
      date: '2026-10-14',
      consommations: [
        { matiere: 'farine', quantite: 6 },
        { matiere: 'levure', quantite: 2.7 },
        { matiere: 'sel', quantite: 0 },
      ],
      par: 'Serge',
    });
    expect(creees).toHaveLength(2);
    expect(mouvementsDeStock()[0]).toMatchObject({
      type: 'sortie',
      matiere: 'levure',
      quantite: 2.7,
      par: 'Serge',
      origine: { genre: 'production', creneau: 'nuit', date: '2026-10-14' },
    });
    expect(await stockDe('farine')).toBe(24);
    expect(await stockDe('levure')).toBe(0);
    expect(await stockDe('sel')).toBe(14.4);
  });

  it('le stock ne descend jamais sous zéro', async () => {
    memoriserUtilisateurConnecte('serge');
    sortirDuStockDepuisProduction({
      creneau: 'jour',
      date: '2026-10-14',
      consommations: [{ matiere: 'bois', quantite: 9 }],
      par: 'Serge',
    });
    expect(await stockDe('bois')).toBe(0);
  });
});

describe('dépenses rattachées au stock : l’entrée suit la validation', () => {
  const DEPENSES = '/api/v1/simulation/comptoir/depenses/';
  const saisieStock = {
    categorie: 'matieres',
    libelle: 'Farine – 10 sacs',
    montant: 195_250,
    mode: 'caisse',
    photo: true,
    rattachement: 'stock',
    matiere: 'farine',
    quantite: 10,
  };
  const entrees = () => mouvementsDeStock().filter((m) => m.origine.genre === 'depense');
  const decider = (id: string, accord: boolean) =>
    repondre(new URL(`http://x/api/v1/simulation/demandes/${id}/decider/`), 'POST', { accord });

  async function depenseEnAttente() {
    memoriserUtilisateurConnecte('willy');
    const reponse = repondre(new URL(`http://x${DEPENSES}`), 'POST', saisieStock);
    const json = (await reponse.json()) as Record<string, any>;
    expect(json.demande).toBeDefined();
    return json.demande.id as string;
  }

  it('au-dessus du seuil, rien n’entre en stock tant que le propriétaire n’a pas accordé', async () => {
    await depenseEnAttente();
    expect(entrees()).toHaveLength(1); // DEP-0016 de départ seulement
    expect(await stockDe('farine')).toBe(30);
  });

  it('l’accord fait entrer la matière avec le numéro de la dépense', async () => {
    const id = await depenseEnAttente();
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(id, true)).status).toBe(200);
    expect(entrees()[0]).toMatchObject({
      type: 'entree',
      matiere: 'farine',
      quantite: 10,
      par: 'Willy',
      origine: { genre: 'depense', code: 'DEP-0017', achat: 'marche' },
    });
    expect(await stockDe('farine')).toBe(40);
  });

  it('le refus ne fait rien entrer : aucune contre-passation à faire', async () => {
    const id = await depenseEnAttente();
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(id, false)).status).toBe(200);
    expect(entrees()).toHaveLength(1);
    expect(await stockDe('farine')).toBe(30);
  });

  it('sous le seuil, l’entrée est immédiate', async () => {
    memoriserUtilisateurConnecte('willy');
    repondre(new URL(`http://x${DEPENSES}`), 'POST', {
      ...saisieStock,
      montant: 10_000,
      quantite: 1,
    });
    expect(await stockDe('farine')).toBe(31);
  });
});
