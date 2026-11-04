import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneDepenses } from '@/espaces/comptoir/depenses/types.ts';
import type { InstantaneStocks } from '@/espaces/atelier/stocks/types.ts';

import { commandesSimulees, facturesSimulees } from './fournisseurs.ts';
import { cloturerSemaine } from './planning.ts';
import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/fournisseurs/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  return { statut: reponse.status, json: (await reponse.json()) as Record<string, any> };
}

async function lireAilleurs<T>(chemin: string): Promise<T> {
  const reponse = repondre(new URL(`http://x/api/v1/simulation/${chemin}`), 'GET', {});
  return (await reponse.json()) as T;
}

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

describe('faux serveur des fournisseurs : relecture', () => {
  it('le mobile money exige une référence (400), gardée sur la facture', async () => {
    const corps = { facture: 'FAC-41', mode: 'mobile' };
    expect((await appeler('POST', 'paiements/', corps)).json.code).toBe('reference_obligatoire');
    expect((await appeler('POST', 'paiements/', { ...corps, reference: '   ' })).statut).toBe(400);
    expect(
      (await appeler('POST', 'paiements/', { ...corps, reference: 'x'.repeat(61) })).json.code,
    ).toBe('reference_invalide');
    expect(facturesSimulees().find((f) => f.numero === 'FAC-41')!.statut).toBe('a-payer');
    const reponse = await appeler('POST', 'paiements/', { ...corps, reference: ' MP241014.K3 ' });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.facture).toMatchObject({ mode: 'mobile', reference: 'MP241014.K3' });
  });

  it('une référence est ignorée hors mobile money ; la dépense créée n’a pas de justificatif', async () => {
    const reponse = await appeler('POST', 'paiements/', {
      facture: 'FAC-41',
      mode: 'banque',
      reference: 'abc',
    });
    expect(reponse.json.facture.reference).toBeUndefined();
    const depenses = await lireAilleurs<InstantaneDepenses>('comptoir/depenses/');
    expect(depenses.depenses[0]!.photo).toBe(false);
  });

  it('une quantité énorme est refusée à la planification et à la réception (400)', async () => {
    const planif = { fournisseur: 'f1', matiere: 'farine', jour: '2026-10-15' };
    expect((await appeler('POST', 'commandes/', { ...planif, quantite: 10_001 })).json.code).toBe(
      'quantite_trop_grande',
    );
    expect((await appeler('POST', 'commandes/', { ...planif, quantite: 10_000 })).statut).toBe(200);
    expect(
      (await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 1e9 })).json.code,
    ).toBe('quantite_trop_grande');
    expect(commandesSimulees().find((c) => c.numero === 'BC-034')!.statut).toBe('planifiee');
    expect(await stockDe('levure')).toBe(2.7);
  });

  it('on ne peut pas enregistrer « rien livré » : la quantité doit être positive (400)', async () => {
    expect(
      (await appeler('POST', 'receptions/', { commande: 'BC-034', quantite: 0 })).json.code,
    ).toBe('quantite_obligatoire');
  });

  it('la farine reçue après la clôture de la semaine se cumule tant que la facture n’est pas payée', async () => {
    cloturerSemaine('S42', { par: 'Willy', jour: '2026-10-18', heure: '21:40' });
    const reponse = await appeler('POST', 'receptions/', { commande: 'BC-033', quantite: 40 });
    expect(reponse.json.facture).toMatchObject({ numero: 'FAC-42', statut: 'a-payer' });
    expect(reponse.json.facture.objet).toMatchObject({ sacs: 84 });
  });

  it('la farine reçue quand la facture de la semaine est payée crée une nouvelle facture', async () => {
    cloturerSemaine('S42', { par: 'Willy', jour: '2026-10-18', heure: '21:40' });
    await appeler('POST', 'paiements/', { facture: 'FAC-42', mode: 'banque' });
    const reponse = await appeler('POST', 'receptions/', { commande: 'BC-033', quantite: 40 });
    expect(reponse.statut).toBe(200);
    expect(reponse.json.facture.numero).toBe('FAC-0214');
    expect(facturesSimulees().find((f) => f.numero === 'FAC-42')!.statut).toBe('payee');
    expect(facturesSimulees()).toHaveLength(6);
  });
});
