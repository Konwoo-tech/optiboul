import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneDepenses } from '@/espaces/comptoir/depenses/types.ts';
import type { InstantaneFournisseurs } from '@/espaces/gestion/fournisseurs/types.ts';
import type { InstantaneStocks } from '@/espaces/atelier/stocks/types.ts';
import type { InstantaneSemaines } from '@/espaces/gestion/semaines/types.ts';
import type { InstantaneTableauDeBord } from '@/espaces/gestion/tableau-de-bord/types.ts';

import {
  commandesSimulees,
  detteFournisseursSimulee,
  facturesSimulees,
  journalFournisseurs,
  libelleFactureFr,
  receptionsParSemaine,
  receptionsPlanifiees,
} from './fournisseurs.ts';
import { cloturerSemaine } from './planning.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import { mouvementsDeStock } from './stocks.ts';

const RACINE = '/api/v1/simulation/gestion/fournisseurs/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  return { statut: reponse.status, json: (await reponse.json()) as Record<string, any> };
}

async function lireAilleurs<T>(chemin: string): Promise<T> {
  const reponse = repondre(new URL(`http://x/api/v1/simulation/${chemin}`), 'GET', {});
  return (await reponse.json()) as T;
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneFournisseurs;
const stockDe = async (cle: string) =>
  (await lireAilleurs<InstantaneStocks>('atelier/stocks/')).matieres.find((m) => m.cle === cle)!
    .stock;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur des fournisseurs : accès', () => {
  it('refuse sans connexion (403)', async () => {
    memoriserUtilisateurConnecte(null);
    const reponse = await appeler('GET');
    expect(reponse.statut).toBe(403);
    expect(reponse.json.code).toBe('non_authentifie');
  });

  it('refuse à la caissière, au chef de production et à l’administrateur (403)', async () => {
    for (const id of ['davy', 'serge', 'admin']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('GET')).statut).toBe(403);
      expect(
        (await appeler('POST', 'paiements/', { facture: 'FAC-41', mode: 'banque' })).statut,
      ).toBe(403);
    }
  });

  it('laisse le propriétaire lire mais refuse toute écriture (403)', async () => {
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('GET')).statut).toBe(200);
    const ecritures: Array<[string, Record<string, unknown>]> = [
      ['commandes/', { fournisseur: 'f1', matiere: 'farine', quantite: 5, jour: '2026-10-15' }],
      ['receptions/', { commande: 'BC-034', quantite: 8 }],
      ['relances/', { commande: 'BC-032' }],
      ['reliquats/', { commande: 'BC-032' }],
      ['paiements/', { facture: 'FAC-41', mode: 'banque' }],
    ];
    for (const [chemin, corps] of ecritures) {
      expect((await appeler('POST', chemin, corps)).statut).toBe(403);
    }
    expect((await lire()).commandes).toHaveLength(7);
    expect(facturesSimulees().find((f) => f.numero === 'FAC-41')!.statut).toBe('a-payer');
  });

  it('un chemin inconnu n’est pas simulé (404 du routeur)', async () => {
    expect((await appeler('POST', 'inconnu/')).statut).toBe(404);
  });
});

describe('faux serveur des fournisseurs : données de la maquette', () => {
  it('donne cinq fournisseurs, sept bons de commande et cinq factures', async () => {
    const instantane = await lire();
    expect(instantane.fournisseurs.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    expect(instantane.commandes.map((c) => `${c.numero}:${c.statut}`)).toEqual([
      'BC-030:recue',
      'BC-031:recue',
      'BC-032:partielle',
      'BC-034:planifiee',
      'BC-033:planifiee',
      'BC-035:planifiee',
      'BC-036:planifiee',
    ]);
    expect(instantane.jours).toHaveLength(8);
    expect(instantane.jours[0]).toBe('2026-10-14');
    const statuts = Object.fromEntries(instantane.factures.map((f) => [f.numero, f.statut]));
    expect(statuts).toEqual({
      'FAC-41': 'a-payer',
      'FAC-42': 'en-cours',
      'FAC-0213': 'a-payer',
      'FAC-0198': 'a-payer',
      'FAC-40': 'payee',
    });
    expect(instantane.factures.filter((f) => f.enRetard).map((f) => f.numero)).toEqual([
      'FAC-41',
      'FAC-0198',
    ]);
  });

  it('la facture de farine d’une semaine ouverte est « en cours », puis « à payer » à la clôture', async () => {
    expect(facturesSimulees().find((f) => f.numero === 'FAC-42')!.statut).toBe('en-cours');
    cloturerSemaine('S42', { par: 'Willy', jour: '2026-10-18', heure: '21:40' });
    expect(facturesSimulees().find((f) => f.numero === 'FAC-42')!.statut).toBe('a-payer');
    memoriserUtilisateurConnecte('willy');
    const reponse = await appeler('POST', 'paiements/', { facture: 'FAC-42', mode: 'mobile' });
    expect(reponse.statut).toBe(200);
  });
});

describe('faux serveur des fournisseurs : planifier', () => {
  const corps = { fournisseur: 'f2', matiere: 'sel', quantite: 12, jour: '2026-10-16' };

  it('crée un bon planifié, numéroté à la suite, rattaché à la semaine du jour', async () => {
    const reponse = await appeler('POST', 'commandes/', corps);
    expect(reponse.statut).toBe(200);
    expect(reponse.json.commande).toMatchObject({
      numero: 'BC-037',
      statut: 'planifiee',
      planifieePar: 'Willy',
      semaine: 'S42',
      commandee: 12,
    });
    expect(journalFournisseurs()[0]!.quoi).toContain('BC-037');
  });

  it('refuse les saisies invalides (404, 400)', async () => {
    expect((await appeler('POST', 'commandes/', { ...corps, fournisseur: 'zz' })).statut).toBe(404);
    expect((await appeler('POST', 'commandes/', { ...corps, matiere: 'glace' })).json.code).toBe(
      'matiere_invalide',
    );
    for (const quantite of [0, -1, 'x', undefined]) {
      expect((await appeler('POST', 'commandes/', { ...corps, quantite })).json.code).toBe(
        'quantite_obligatoire',
      );
    }
    expect((await appeler('POST', 'commandes/', { ...corps, jour: '2026-10-13' })).json.code).toBe(
      'jour_invalide',
    );
    expect((await appeler('POST', 'commandes/', { ...corps, jour: '2026-10-22' })).json.code).toBe(
      'jour_invalide',
    );
    expect((await lire()).commandes).toHaveLength(7);
  });

  it('la prochaine réception du stock suit le nouveau bon', async () => {
    await appeler('POST', 'commandes/', {
      fournisseur: 'f2',
      matiere: 'levure',
      quantite: 3,
      jour: '2026-10-14',
    });
    const stock = await lireAilleurs<InstantaneStocks>('atelier/stocks/');
    expect(stock.receptions.filter((r) => r.matiere === 'levure')).toHaveLength(2);
  });
});

describe('faux serveur des fournisseurs : réceptionner', () => {
  it('une réception complète entre en stock par les fonctions du stock et crée la facture', async () => {
    const avant = await stockDe('levure');
    const reponse = await appeler('POST', 'receptions/', {
      commande: 'BC-034',
      quantite: 8,
      observation: 'Bon état',
    });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.commande).toMatchObject({ statut: 'recue', recue: 8, recuePar: 'Willy' });
    expect(reponse.json.facture).toMatchObject({
      numero: 'FAC-0214',
      montant: 40_000,
      statut: 'a-payer',
      echeance: '2026-10-21',
    });
    expect(await stockDe('levure')).toBe(avant + 8);
    expect(mouvementsDeStock()[0]).toMatchObject({
      type: 'entree',
      matiere: 'levure',
      quantite: 8,
      origine: {
        genre: 'reception',
        code: 'BC-034',
        fournisseur: 'Mfoundi Levures & Sel',
        partielle: false,
      },
    });
    expect(journalFournisseurs()[0]!.quoi).toContain('Bon état');
  });

  it('une réception partielle garde un manquant et une facture au prorata', async () => {
    const reponse = await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 5 });
    expect(reponse.json.commande.statut).toBe('partielle');
    expect(reponse.json.facture).toMatchObject({ montant: 25_000 });
    expect(reponse.json.facture.objet).toMatchObject({ recue: 5, commandee: 8 });
    expect(mouvementsDeStock()[0]!.origine).toMatchObject({ partielle: true });
    const dashboard = await lireAilleurs<InstantaneTableauDeBord>('gestion/tableau-de-bord/');
    expect(dashboard.alertes.filter((a) => a.type === 'manquant-fournisseur')).toHaveLength(2);
  });

  it('la quantité reçue est plafonnée à la commande', async () => {
    const reponse = await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 99 });
    expect(reponse.json.commande).toMatchObject({ recue: 8, statut: 'recue' });
  });

  it('la farine se cumule sur la facture de la semaine', async () => {
    const avant = facturesSimulees().find((f) => f.numero === 'FAC-42')!;
    const reponse = await appeler('POST', 'receptions/', { commande: 'BC-033', quantite: 40 });
    expect(reponse.json.facture).toMatchObject({
      numero: 'FAC-42',
      montant: avant.montant + 40 * 19_525,
    });
    expect(reponse.json.facture.objet).toMatchObject({ sacs: 84 });
    expect(facturesSimulees()).toHaveLength(5);
    expect(libelleFactureFr(reponse.json.facture)).toBe('Farine · semaine 42 (84 sacs à ce jour)');
    expect(await stockDe('farine')).toBe(70);
  });

  it('refuse un bon inconnu (404), déjà reçu (409) ou une quantité invalide (400)', async () => {
    expect((await appeler('POST', 'receptions/', { commande: 'BC-999', quantite: 1 })).statut).toBe(
      404,
    );
    expect((await appeler('POST', 'receptions/', { commande: 'BC-030', quantite: 1 })).statut).toBe(
      409,
    );
    expect((await appeler('POST', 'receptions/', { commande: 'BC-032', quantite: 1 })).statut).toBe(
      409,
    );
    for (const quantite of [0, -3, 'a', undefined]) {
      expect((await appeler('POST', 'receptions/', { commande: 'BC-034', quantite })).statut).toBe(
        400,
      );
    }
    const encore = commandesSimulees().find((c) => c.numero === 'BC-034')!;
    expect(encore.statut).toBe('planifiee');
    expect(await stockDe('levure')).toBe(2.7);
    // Une deuxième réception du même bon est refusée : pas de double entrée de stock.
    await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 8 });
    expect((await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 8 })).statut).toBe(
      409,
    );
    expect(await stockDe('levure')).toBe(10.7);
  });
});

describe('faux serveur des fournisseurs : manquant', () => {
  it('relancer trace la relance ; refusé sans manquant (409) ou pour un bon inconnu (404)', async () => {
    expect((await appeler('POST', 'relances/', { commande: 'BC-032' })).statut).toBe(200);
    expect(journalFournisseurs()[0]!.quoi).toContain('Relance fournisseur Mfoundi Levures & Sel');
    expect((await appeler('POST', 'relances/', { commande: 'BC-030' })).statut).toBe(409);
    expect((await appeler('POST', 'relances/', { commande: 'BC-999' })).statut).toBe(404);
  });

  it('replanifier solde le bon d’origine et crée un bon pour le reliquat, une seule fois', async () => {
    const reponse = await appeler('POST', 'reliquats/', { commande: 'BC-032' });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.commande).toMatchObject({
      statut: 'recue',
      commandee: 6,
      reliquat: 'BC-037',
    });
    expect(reponse.json.reliquat).toMatchObject({
      numero: 'BC-037',
      commandee: 4,
      statut: 'planifiee',
      jour: '2026-10-15',
      planifieePar: 'Willy',
    });
    expect((await appeler('POST', 'reliquats/', { commande: 'BC-032' })).statut).toBe(409);
    expect((await appeler('POST', 'reliquats/', { commande: 'BC-999' })).statut).toBe(404);
    expect((await appeler('POST', 'relances/', { commande: 'BC-032' })).statut).toBe(409);
    expect(
      (await lireAilleurs<InstantaneTableauDeBord>('gestion/tableau-de-bord/')).alertes.some(
        (a) => a.type === 'manquant-fournisseur',
      ),
    ).toBe(false);
  });
});

describe('faux serveur des fournisseurs : payer', () => {
  it('paie une facture et crée la dépense rattachée au stock', async () => {
    const realiseAvant = (await lireAilleurs<InstantaneDepenses>('comptoir/depenses/')).budget.find(
      (b) => b.categorie === 'matieres',
    )!.realise;
    const reponse = await appeler('POST', 'paiements/', { facture: 'FAC-41', mode: 'banque' });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.depense).toBe('DEP-0017');
    expect(reponse.json.facture).toMatchObject({
      statut: 'payee',
      mode: 'banque',
      payeeLe: '2026-10-14',
      enRetard: false,
      depense: 'DEP-0017',
    });
    const depenses = await lireAilleurs<InstantaneDepenses>('comptoir/depenses/');
    expect(depenses.depenses[0]).toMatchObject({
      numero: 17,
      libelle: 'Paiement FAC-41 · Grands Moulins du Centre',
      montant: 1_405_800,
      mode: 'banque',
      categorie: 'matieres',
      statut: 'validee',
      rattachement: { type: 'stock', facture: 'FAC-41' },
    });
    // Aucune nouvelle entrée de stock : la matière est entrée à la réception.
    expect(mouvementsDeStock().filter((m) => m.origine.genre === 'depense')).toHaveLength(1);
    const budget = depenses.budget.find((b) => b.categorie === 'matieres')!;
    expect(budget.realise).toBe(realiseAvant + 1_405_800);
  });

  it('la dette et les retards suivent le paiement dans le tableau de bord et les semaines', async () => {
    expect(detteFournisseursSimulee()).toEqual({ montant: 2_334_900, enRetard: 2 });
    await appeler('POST', 'paiements/', { facture: 'FAC-41', mode: 'especes' });
    expect(detteFournisseursSimulee()).toEqual({ montant: 929_100, enRetard: 1 });
    const dashboard = await lireAilleurs<InstantaneTableauDeBord>('gestion/tableau-de-bord/');
    expect(dashboard.dettesFournisseurs).toEqual({ montant: 929_100, facturesEnRetard: 1 });
    expect(dashboard.alertes.filter((a) => a.type === 'facture-en-retard')).toHaveLength(1);
  });

  it('mode espèces, banque ou mobile money seulement (400) ; facture inconnue (404)', async () => {
    expect(
      (await appeler('POST', 'paiements/', { facture: 'FAC-41', mode: 'cheque' })).statut,
    ).toBe(400);
    expect(
      (await appeler('POST', 'paiements/', { facture: 'FAC-999', mode: 'banque' })).statut,
    ).toBe(404);
    expect(facturesSimulees().find((f) => f.numero === 'FAC-41')!.statut).toBe('a-payer');
  });

  it('refuse une facture déjà payée ou encore en cours (409), sans second paiement', async () => {
    expect(
      (await appeler('POST', 'paiements/', { facture: 'FAC-40', mode: 'banque' })).statut,
    ).toBe(409);
    expect(
      (await appeler('POST', 'paiements/', { facture: 'FAC-42', mode: 'banque' })).statut,
    ).toBe(409);
    await appeler('POST', 'paiements/', { facture: 'FAC-0198', mode: 'banque' });
    expect(
      (await appeler('POST', 'paiements/', { facture: 'FAC-0198', mode: 'banque' })).statut,
    ).toBe(409);
    const depenses = await lireAilleurs<InstantaneDepenses>('comptoir/depenses/');
    expect(depenses.depenses.filter((d) => d.libelle.startsWith('Paiement FAC'))).toHaveLength(1);
  });
});

describe('source unique des fournisseurs', () => {
  it('le tableau de bord, les semaines, le stock et les dépenses lisent les mêmes données', async () => {
    const dettes = detteFournisseursSimulee();
    const dashboard = await lireAilleurs<InstantaneTableauDeBord>('gestion/tableau-de-bord/');
    expect(dashboard.dettesFournisseurs).toEqual({
      montant: dettes.montant,
      facturesEnRetard: dettes.enRetard,
    });
    const semaines = await lireAilleurs<InstantaneSemaines>('gestion/semaines/');
    const parSemaine = receptionsParSemaine();
    for (const [id, indicateurs] of Object.entries(semaines.indicateurs)) {
      expect(indicateurs.receptions).toBe(parSemaine[id] ?? 0);
    }
    const stock = await lireAilleurs<InstantaneStocks>('atelier/stocks/');
    expect(stock.receptions).toEqual(receptionsPlanifiees());
    const depenses = await lireAilleurs<InstantaneDepenses>('comptoir/depenses/');
    expect(depenses.fournisseurs.map((f) => f.nom)).toEqual(
      (await lire()).fournisseurs.map((f) => f.nom),
    );
  });

  it('planifier ou réceptionner met à jour les semaines et le stock sans autre écriture', async () => {
    await appeler('POST', 'commandes/', {
      fournisseur: 'f4',
      matiere: 'bois',
      quantite: 2,
      jour: '2026-10-15',
    });
    expect(receptionsParSemaine().S42).toBe(7);
    const semaines = await lireAilleurs<InstantaneSemaines>('gestion/semaines/');
    expect(semaines.indicateurs.S42!.receptions).toBe(7);
    await appeler('POST', 'receptions/', { commande: 'BC-035', quantite: 3 });
    const stock = await lireAilleurs<InstantaneStocks>('atelier/stocks/');
    expect(stock.receptions.find((r) => r.matiere === 'bois')!.quantite).toBe(2);
    expect(stock.matieres.find((m) => m.cle === 'bois')!.stock).toBe(7);
  });

  it('le libellé français des contrôles de clôture reprend la facture', () => {
    const libelles = Object.fromEntries(
      facturesSimulees().map((f) => [f.numero, libelleFactureFr(f)]),
    );
    expect(libelles).toEqual({
      'FAC-41': 'Farine · semaine 41 (72 sacs)',
      'FAC-42': 'Farine · semaine 42 (44 sacs à ce jour)',
      'FAC-0213': 'BC-032 · Levure, 6 kg reçus sur 10',
      'FAC-0198': 'Bois · 2 chargements (BC-027)',
      'FAC-40': 'Farine · semaine 40 (81 sacs)',
    });
  });
});
