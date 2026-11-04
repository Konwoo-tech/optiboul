import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { journalFournisseurs } from './fournisseurs.ts';
import { lireJournal } from './journal.ts';
import { journalPersonnel } from './personnel.ts';
import { cloturerSemaine } from './planning.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { journalSemaines } from './semaines.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import { journalUtilisateurs } from './utilisateurs.ts';

/*
 * Cohérence du registre unique pour la gestion (semaines, paie, fournisseurs, utilisateurs) et
 * pour l'archivage fait par le système : une action faite sur un écran apparaît une seule fois
 * dans le journal, avec auteur, profil, type et date.
 */

const RACINE = '/api/v1/simulation';

async function appeler(chemin: string, methode: string, corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as Record<string, any> };
}

const dernier = () => lireJournal()[0]!;
const nouvelles = (avant: number) => lireJournal().slice(0, lireJournal().length - avant);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('semaines', () => {
  it('une affectation est consignée au type « semaine » avec la personne avant / après', async () => {
    memoriserUtilisateurConnecte('fotso');
    await appeler('/gestion/semaines/affectations/', 'POST', {
      semaine: 'S44',
      role: 'gerant',
      personne: 'christelle',
    });
    expect(dernier()).toMatchObject({
      auteur: 'M. Fotso',
      profil: 'proprietaire',
      type: 'semaine',
      apres: 'Christelle',
      jour: '2026-10-14',
    });
    expect(dernier().avant).toBeTruthy();
    expect(journalSemaines()[0]!.quoi).toBe(dernier().texte);
  });
});

describe('paie', () => {
  it('le jour de paie garde l’ancien et le nouveau jour', async () => {
    await appeler('/gestion/personnel/jour/', 'PUT', { jour: '2026-10-30' });
    expect(dernier()).toMatchObject({
      auteur: 'Willy',
      profil: 'gerant',
      type: 'paie',
      avant: expect.stringMatching(/^2026-10-\d\d$/),
      apres: '2026-10-30',
    });
  });

  it('un paiement de salaire écrit une ligne « paie » et une ligne « dépense », sans doublon', async () => {
    await appeler('/gestion/personnel/soumettre/', 'POST');
    memoriserUtilisateurConnecte('fotso');
    const demandes = (await appeler('/demandes/', 'GET')).json.demandes as Array<
      Record<string, any>
    >;
    const demande = demandes.find((d) => d.type === 'paie')!;
    await appeler(`/demandes/${demande.id}/decider/`, 'POST', { accord: true });
    memoriserUtilisateurConnecte('willy');
    const avant = lireJournal().length;
    const r = await appeler('/gestion/personnel/paiements/', 'POST', {
      employe: 'davy',
      mode: 'especes',
      montant: 2_000,
    });
    expect(r.statut).toBe(200);
    const lignes = nouvelles(avant);
    expect(lignes.map((e) => e.type).sort()).toEqual(['depense', 'paie']);
    expect(lignes.every((e) => e.auteur === 'Willy' && e.profil === 'gerant')).toBe(true);
    expect(journalPersonnel()).toHaveLength(3);
  });
});

describe('fournisseurs', () => {
  it('une relance est consignée au type « fournisseur »', async () => {
    const r = await appeler('/gestion/fournisseurs/relances/', 'POST', { commande: 'BC-032' });
    expect(r.statut).toBe(200);
    expect(dernier()).toMatchObject({ auteur: 'Willy', profil: 'gerant', type: 'fournisseur' });
    expect(dernier().texte).toContain('Relance fournisseur');
    expect(journalFournisseurs()[0]!.quoi).toBe(dernier().texte);
  });

  it('le paiement d’une facture écrit une ligne « fournisseur » et une ligne « dépense », sans doublon', async () => {
    cloturerSemaine('S42', { par: 'Willy', jour: '2026-10-18', heure: '21:40' });
    const avant = lireJournal().length;
    const r = await appeler('/gestion/fournisseurs/paiements/', 'POST', {
      facture: 'FAC-42',
      mode: 'banque',
    });
    expect(r.statut).toBe(200);
    const lignes = nouvelles(avant);
    expect(lignes.filter((e) => e.type === 'fournisseur')).toHaveLength(1);
    expect(lignes.filter((e) => e.type === 'depense')).toHaveLength(1);
    expect(lignes).toHaveLength(2);
  });
});

describe('utilisateurs', () => {
  it('le changement de groupe et la création de groupe sont consignés au type « utilisateur »', async () => {
    memoriserUtilisateurConnecte('admin');
    const cree = await appeler('/gestion/utilisateurs/groupes/', 'POST', {
      nom: 'Livreurs',
      profil: 'caissier',
      description: '',
    });
    expect(cree.statut).toBe(201);
    expect(dernier()).toMatchObject({
      auteur: 'Support OptiBoul',
      profil: 'administrateur',
      type: 'utilisateur',
      texte: 'Création du groupe Livreurs (Caissier)',
    });
    expect(journalUtilisateurs()[0]!.quoi).toBe(dernier().texte);
  });

  it('un code réinitialisé et une désactivation sont consignés une seule fois chacun', async () => {
    memoriserUtilisateurConnecte('admin');
    const avant = lireJournal().length;
    expect((await appeler('/gestion/utilisateurs/davy/reinitialiser-code/', 'POST')).statut).toBe(
      200,
    );
    expect(nouvelles(avant)).toHaveLength(1);
    expect(dernier().texte).toBe('Réinitialisation du code de Davy');
    await appeler('/gestion/utilisateurs/davy/activation/', 'PUT', { actif: false });
    expect(nouvelles(avant)).toHaveLength(2);
    expect(dernier()).toMatchObject({ type: 'utilisateur', texte: 'Désactivation du compte Davy' });
  });
});

describe('système', () => {
  it('l’archivage d’une production non clôturée est consigné au nom du système, sans profil', async () => {
    await appeler('/atelier/production/', 'GET');
    memoriserUtilisateurConnecte('davy');
    const comptoir = '/comptoir/session/';
    await appeler(`${comptoir}comptage/`, 'PUT', { especes: '1000' });
    await appeler(`${comptoir}cloturer/`, 'POST');
    await appeler(`${comptoir}ouvrir-suivante/`, 'POST');
    memoriserUtilisateurConnecte('willy');
    await appeler('/atelier/production/', 'GET');
    const archivage = lireJournal().find((e) => e.auteur === 'Système')!;
    expect(archivage).toMatchObject({
      profil: null,
      type: 'production',
      jour: '2026-10-14',
    });
    expect(archivage.texte).toContain('Production non clôturée archivée');
  });
});
