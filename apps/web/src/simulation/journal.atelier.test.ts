import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lireJournal } from './journal.ts';
import { journalProduction, placerLeCycle } from './production.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import { journalStocks } from './stocks.ts';

/*
 * Cohérence du registre unique pour l'atelier (stocks, production) : une action faite sur un
 * écran apparaît dans le journal, avec auteur, profil, type et date, une seule fois.
 */

const RACINE = '/api/v1/simulation';

async function appeler(chemin: string, methode: string, corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const dernier = () => lireJournal()[0]!;

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
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('stocks', () => {
  it('un mouvement manuel est consigné au type « stock » par son auteur', async () => {
    const r = await appeler('/atelier/stocks/mouvements/', 'POST', {
      type: 'perte',
      matiere: 'farine',
      quantite: 2,
      motif: 'Sacs mouillés',
    });
    expect(r.statut).toBe(200);
    expect(dernier()).toMatchObject({
      auteur: 'Willy',
      profil: 'gerant',
      type: 'stock',
      texte: 'Mouvement de stock manuel : perte 2 farine – Sacs mouillés',
      jour: '2026-10-14',
      heure: '18:02',
    });
  });

  it('un inventaire validé tout de suite est consigné au type « stock »', async () => {
    const r = await appeler('/atelier/stocks/inventaires/', 'POST', {
      comptages: COMPTAGE_PROCHE,
    });
    expect(r.statut).toBe(200);
    expect(dernier()).toMatchObject({ auteur: 'Willy', type: 'stock' });
    expect(dernier().texte).toContain('validé · stock ajusté');
  });

  it('une entrée en stock par une dépense n’écrit qu’une fois, au type « dépense »', async () => {
    memoriserUtilisateurConnecte('davy');
    const avant = lireJournal().length;
    const r = await appeler('/comptoir/depenses/', 'POST', {
      categorie: 'matieres',
      libelle: 'Levure',
      montant: 8000,
      mode: 'caisse',
      photo: true,
      rattachement: 'stock',
      matiere: 'levure',
      quantite: 2.5,
      fournisseur: 'f2',
    });
    expect(r.statut).toBe(200);
    const nouvelles = lireJournal().slice(0, lireJournal().length - avant);
    expect(nouvelles).toHaveLength(1);
    expect(nouvelles[0]).toMatchObject({ auteur: 'Davy', type: 'depense' });
    expect(journalStocks()).toHaveLength(0);
  });
});

describe('production', () => {
  it('le plan proposé puis validé est consigné au type « production »', async () => {
    placerLeCycle('commandes');
    memoriserUtilisateurConnecte('serge');
    await appeler('/atelier/production/plan/proposer/', 'POST');
    expect(dernier()).toMatchObject({ auteur: 'Serge', profil: 'production', type: 'production' });
    expect(dernier().texte).toContain('Plan de production proposé');
    memoriserUtilisateurConnecte('willy');
    await appeler('/atelier/production/plan/valider/', 'POST');
    expect(dernier()).toMatchObject({ auteur: 'Willy', profil: 'gerant', type: 'production' });
    expect(dernier().texte).toContain('Plan de production validé');
  });

  it('la modification d’une fiche garde la version avant / après', async () => {
    memoriserUtilisateurConnecte('fotso');
    const lecture = await appeler('/atelier/production/fiches/', 'GET');
    const recette = { ...lecture.json.fiches[0].recette, farine: 51 };
    expect((await appeler('/atelier/production/fiches/bag/', 'PUT', recette)).statut).toBe(200);
    expect(dernier()).toMatchObject({
      auteur: 'M. Fotso',
      profil: 'proprietaire',
      type: 'production',
      avant: 'version 3',
      apres: 'version 4',
    });
  });

  it('chaque ligne des journaux locaux de l’atelier se retrouve dans le registre, une fois', async () => {
    await appeler('/atelier/stocks/mouvements/', 'POST', {
      type: 'perte',
      matiere: 'farine',
      quantite: 2,
      motif: 'Sacs mouillés',
    });
    placerLeCycle('commandes');
    memoriserUtilisateurConnecte('serge');
    await appeler('/atelier/production/plan/proposer/', 'POST');
    const locaux = [
      ...journalStocks().map((l) => [l.qui, l.quoi]),
      ...journalProduction().map((l) => [l.qui, l.quoi]),
    ];
    expect(locaux.length).toBeGreaterThanOrEqual(2);
    const registre = lireJournal();
    for (const [qui, quoi] of locaux) {
      expect(registre.filter((e) => e.auteur === qui && e.texte === quoi)).toHaveLength(1);
    }
  });
});
