import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneJournal } from '@/espaces/gestion/journal/types.ts';

import { journalComptoir } from './comptoir.ts';
import { journalDepenses } from './depenses.ts';
import { lireJournal } from './journal.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

/*
 * Cohérence du registre unique pour le comptoir (caisses, session, dépenses) et les connexions :
 * une action faite sur un écran apparaît dans le journal, avec auteur, profil, type et date.
 */

const RACINE = '/api/v1/simulation';

async function appeler(chemin: string, methode: string, corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const dernier = () => lireJournal()[0]!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('davy');
});
afterEach(() => vi.useRealTimers());

describe('routeur : le journal est branché', () => {
  it('lit le registre par le routeur, avec les droits (403 sans connexion ni droit)', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('/gestion/journal/', 'GET')).json.code).toBe('non_authentifie');
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('/gestion/journal/', 'GET')).statut).toBe(403);
    memoriserUtilisateurConnecte('fotso');
    const r = await appeler('/gestion/journal/', 'GET');
    expect(r.statut).toBe(200);
    expect((r.json as InstantaneJournal).total).toBe(10);
  });

  it('refuse toute modification par le routeur (405), connecté ou non', async () => {
    for (const id of [null, 'fotso']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('/gestion/journal/', 'DELETE')).statut).toBe(405);
    }
    expect(lireJournal()).toHaveLength(10);
  });

  it('reinitialiserSimulation remet le registre à son état de départ', async () => {
    await appeler('/comptoir/session/mouvements/', 'POST', {
      type: 'retours',
      produit: 'KO',
      quantite: 8,
      motif: 'Retour',
    });
    expect(lireJournal().length).toBeGreaterThan(10);
    reinitialiserSimulation();
    expect(lireJournal()).toHaveLength(10);
  });
});

describe('connexions et déconnexions', () => {
  it('nom et code, puis changement d’utilisateur', async () => {
    memoriserUtilisateurConnecte(null);
    await appeler('/identification/', 'POST', {
      methode: 'code',
      utilisateur: 'davy',
      code: '1234',
      deuxFacteurs: false,
    });
    expect(dernier()).toMatchObject({
      auteur: 'Davy',
      profil: 'caissier',
      type: 'connexion',
      texte: 'Connexion',
      jour: '2026-10-14',
      heure: '18:02',
    });
    await appeler('/deconnexion/', 'POST');
    expect(dernier()).toMatchObject({ auteur: 'Davy', texte: 'Changement d’utilisateur' });
  });

  it('e-mail avec double authentification, puis déconnexion pour inactivité', async () => {
    memoriserUtilisateurConnecte(null);
    await appeler('/identification/', 'POST', {
      methode: 'email',
      email: 'willy.boulfaubourg@gmail.com',
      motDePasse: 'optiboul',
    });
    await appeler('/otp/envoyer/', 'POST', { canal: 'whatsapp' });
    await appeler('/otp/verifier/', 'POST', { code: '123456' });
    expect(dernier()).toMatchObject({
      auteur: 'Willy',
      profil: 'gerant',
      type: 'connexion',
      texte: 'Connexion via e-mail · double authentification par WhatsApp',
    });
    await appeler('/deconnexion/', 'POST', { raison: 'inactivite' });
    expect(dernier().texte).toBe('Déconnexion automatique (inactivité)');
  });

  it('un code faux, un mauvais mot de passe ou une déconnexion sans session ne consignent rien', async () => {
    memoriserUtilisateurConnecte(null);
    await appeler('/identification/', 'POST', {
      methode: 'code',
      utilisateur: 'davy',
      code: '0000',
      deuxFacteurs: false,
    });
    await appeler('/identification/', 'POST', {
      methode: 'email',
      email: 'willy.boulfaubourg@gmail.com',
      motDePasse: 'faux',
    });
    await appeler('/deconnexion/', 'POST');
    expect(lireJournal()).toHaveLength(10);
  });
});

describe('comptoir : session, caisses, dépenses', () => {
  it('un mouvement interne est consigné au type « session »', async () => {
    await appeler('/comptoir/session/mouvements/', 'POST', {
      type: 'retours',
      produit: 'KO',
      quantite: 8,
      motif: 'Retour du client',
    });
    expect(dernier()).toMatchObject({
      auteur: 'Davy',
      profil: 'caissier',
      type: 'session',
      texte: 'Mouvement interne : retours 8 KO',
      jour: '2026-10-14',
    });
  });

  it('une livraison est consignée avec des montants lisibles (« 5 000 »)', async () => {
    const r = await appeler('/comptoir/session/livraisons/', 'POST', {
      clientId: 'alex',
      quantites: { BAG: 50, KO: 0, GC: 0 },
      mode: 'especes',
      recu: 4000,
      reference: '',
    });
    expect(r.statut).toBe(200);
    expect(dernier()).toMatchObject({ auteur: 'Davy', type: 'session' });
    expect(dernier().texte.replace(/[  ]/g, ' ')).toBe(
      'Livraison Alex – 5 000 FCFA dû, 4 000 reçu',
    );
  });

  it('la demande d’autorisation et l’autorisation du gérant sont du type « demande »', async () => {
    await appeler('/comptoir/session/autorisations/', 'POST', {
      clientId: 'brice',
      soldeApres: -6200,
    });
    expect(dernier()).toMatchObject({
      auteur: 'Davy',
      type: 'demande',
      texte: 'Demande d’autorisation : Brice',
    });
    memoriserUtilisateurConnecte('willy');
    await appeler('/comptoir/session/autorisations/', 'POST', {
      clientId: 'brice',
      soldeApres: -6200,
    });
    expect(dernier()).toMatchObject({ auteur: 'Willy', profil: 'gerant', type: 'demande' });
    expect(dernier().texte.replace(/[  ]/g, ' ')).toBe(
      'Autorisation de dépassement du plafond : Brice (−6 200 FCFA)',
    );
  });

  it('une dépense est consignée au type « dépense » par son auteur', async () => {
    await appeler('/comptoir/depenses/', 'POST', {
      categorie: 'technique',
      libelle: 'Joint de porte',
      montant: 8000,
      mode: 'caisse',
      photo: true,
      rattachement: 'semaine',
    });
    const entree = lireJournal().find((e) => e.type === 'depense' && e.texte.includes('Joint'))!;
    expect(entree).toMatchObject({ auteur: 'Davy', profil: 'caissier', jour: '2026-10-14' });
    expect(entree.texte.replace(/[  ]/g, ' ')).toContain('8 000 FCFA');
  });

  it('la fermeture de caisse est consignée au type « caisse »', async () => {
    const r = await appeler('/caisses/fermer/', 'POST', { compte: 22_450 });
    expect(r.statut).toBeLessThan(300);
    expect(dernier()).toMatchObject({ auteur: 'Davy', profil: 'caissier', type: 'caisse' });
    expect(dernier().texte).toContain('Fermeture de caisse');
  });

  it('non-régression : les traces locales Session et Dépenses affichent aussi « 5 000 » (et non « 5000 »)', async () => {
    await appeler('/comptoir/session/livraisons/', 'POST', {
      clientId: 'alex',
      quantites: { BAG: 50, KO: 0, GC: 0 },
      mode: 'especes',
      recu: 4000,
      reference: '',
    });
    const espaces = /[  ]/g;
    expect(journalComptoir()[0]!.quoi.replace(espaces, ' ')).toBe(
      'Livraison Alex – 5 000 FCFA dû, 4 000 reçu',
    );
    await appeler('/comptoir/depenses/', 'POST', {
      categorie: 'technique',
      libelle: 'Joint de porte',
      montant: 8000,
      mode: 'caisse',
      photo: true,
      rattachement: 'semaine',
    });
    expect(journalDepenses()[0]!.quoi.replace(espaces, ' ')).toBe(
      'Dépense DEP-0017 : Joint de porte – 8 000 FCFA, rattachée à la semaine S42',
    );
    // Une seule écriture par action : la ligne locale et la ligne du registre sont les mêmes.
    expect(lireJournal().filter((e) => e.texte.includes('Joint de porte'))).toHaveLength(1);
  });

  it('chaque ligne des journaux locaux du comptoir se retrouve dans le registre', async () => {
    await appeler('/comptoir/session/mouvements/', 'POST', {
      type: 'ration',
      produit: 'BAG',
      quantite: 3,
      motif: 'Ration',
    });
    await appeler('/comptoir/depenses/', 'POST', {
      categorie: 'technique',
      libelle: 'Joint',
      montant: 8000,
      mode: 'caisse',
      photo: true,
      rattachement: 'semaine',
    });
    const locaux = [
      ...journalComptoir().map((l) => [l.qui, l.quoi]),
      ...journalDepenses().map((l) => [l.qui, l.quoi]),
    ];
    expect(locaux.length).toBeGreaterThanOrEqual(2);
    const registre = lireJournal();
    for (const [qui, quoi] of locaux) {
      expect(registre.some((e) => e.auteur === qui && e.texte === quoi)).toBe(true);
    }
  });
});
