import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantanePaie } from '@/espaces/gestion/personnel/types.ts';

import { journalPersonnel } from './personnel.ts';
import { repondre, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/personnel/';

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

const lire = async () => (await appeler('GET')).json as unknown as InstantanePaie;
const employe = async (id: string) => (await lire()).employes.find((e) => e.id === id)!;
const toutes = async () =>
  (await appeler('GET', '', {}, '/api/v1/simulation/demandes/')).json.demandes as Array<
    Record<string, any>
  >;

/** Le gérant soumet, le propriétaire valide : le paiement est ouvert. */
async function validee() {
  memoriserUtilisateurConnecte('willy');
  await appeler('POST', 'soumettre/');
  memoriserUtilisateurConnecte('fotso');
  const demande = (await toutes()).find((d) => d.type === 'paie')!;
  await appeler('POST', `${demande.id}/decider/`, { accord: true }, '/api/v1/simulation/demandes/');
  memoriserUtilisateurConnecte('willy');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => vi.useRealTimers());

describe('faux serveur Personnel : droits', () => {
  it('refuse sans connexion', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET')).statut).toBe(403);
  });

  it.each(['davy', 'serge', 'admin'])(
    'refuse %s : la paie est réservée à la direction',
    async (id) => {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('GET')).statut).toBe(403);
      expect((await appeler('POST', 'ajustements/', { employe: 'davy' })).statut).toBe(403);
      expect((await appeler('POST', 'paiements/restes/', { mode: 'especes' })).statut).toBe(403);
    },
  );

  it('le gérant et le propriétaire lisent l’état de paie de la maquette', async () => {
    for (const id of ['willy', 'fotso']) {
      memoriserUtilisateurConnecte(id);
      const paie = await lire();
      expect(paie).toMatchObject({
        mois: '2026-10',
        statut: 'brouillon',
        jourDePaie: '2026-10-31',
      });
      expect(paie.employes).toHaveLength(8);
      expect(paie.calendrier.map((m) => m.mois)).toEqual([
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
        '2026-12',
      ]);
    }
  });

  it('les noms viennent des comptes de démonstration', async () => {
    const noms = (await lire()).employes.map((e) => e.nom);
    expect(noms.slice(0, 5)).toEqual(['Willy', 'Davy', 'Rachel', 'Serge', 'Ignace']);
    expect((await employe('davy')).ajustements[0]!.par).toBe('Patrick');
    expect((await employe('serge')).ajustements[0]!.par).toBe('M. Fotso');
  });
});

describe('faux serveur Personnel : brouillon (US-122)', () => {
  it('ajoute puis retire un gain motivé, tracé dans le journal', async () => {
    const r = await appeler('POST', 'ajustements/', {
      employe: 'rachel',
      type: 'gain',
      libelle: ' Prime ',
      montant: 4_000,
    });
    expect(r.statut).toBe(200);
    const ligne = (await employe('rachel')).ajustements[0]!;
    expect(ligne).toMatchObject({
      libelle: 'Prime',
      montant: 4_000,
      date: '2026-10-14',
      par: 'Willy',
    });
    expect(journalPersonnel()[0]!.quoi).toContain('Gain ajouté(e) à Rachel');
    expect((await appeler('DELETE', `ajustements/${ligne.id}/`)).statut).toBe(200);
    expect((await employe('rachel')).ajustements).toEqual([]);
  });

  it('valide la saisie : 400 et 404', async () => {
    const base = { employe: 'rachel', type: 'gain', libelle: 'x', montant: 10 };
    expect((await appeler('POST', 'ajustements/', { ...base, libelle: ' ' })).json.code).toBe(
      'libelle_obligatoire',
    );
    expect((await appeler('POST', 'ajustements/', { ...base, montant: 0 })).json.code).toBe(
      'montant_invalide',
    );
    expect((await appeler('POST', 'ajustements/', { ...base, montant: 1.5 })).statut).toBe(400);
    expect((await appeler('POST', 'ajustements/', { ...base, type: 'prime' })).json.code).toBe(
      'type_invalide',
    );
    expect((await appeler('POST', 'ajustements/', { ...base, employe: 'zorro' })).statut).toBe(404);
    expect((await appeler('DELETE', 'ajustements/inconnue/')).statut).toBe(404);
  });

  it('choisit le jour de paie parmi ceux proposés', async () => {
    expect((await appeler('PUT', 'jour/', { jour: '2026-10-30' })).statut).toBe(200);
    expect((await lire()).jourDePaie).toBe('2026-10-30');
    expect((await appeler('PUT', 'jour/', { jour: '2026-10-29' })).json.code).toBe('jour_invalide');
  });

  it('planifie le jour des paies à venir, pas celui d’un mois passé', async () => {
    expect(
      (await appeler('PUT', 'calendrier/', { mois: '2026-11', jour: '2026-11-27' })).statut,
    ).toBe(200);
    expect((await lire()).calendrier.find((m) => m.mois === '2026-11')!.jour).toBe('2026-11-27');
    expect(
      (await appeler('PUT', 'calendrier/', { mois: '2026-11', jour: '2026-11-29' })).statut,
    ).toBe(400);
    expect(
      (await appeler('PUT', 'calendrier/', { mois: '2026-09', jour: '2026-09-30' })).statut,
    ).toBe(404);
  });

  it('verrouille les lignes et le jour dès que l’état est soumis (409)', async () => {
    await appeler('POST', 'soumettre/');
    const ligne = (await employe('davy')).ajustements[0]!;
    const verrou = 'etat_verrouille';
    expect(
      (
        await appeler('POST', 'ajustements/', {
          employe: 'davy',
          type: 'gain',
          libelle: 'a',
          montant: 5,
        })
      ).json.code,
    ).toBe(verrou);
    expect((await appeler('DELETE', `ajustements/${ligne.id}/`)).json.code).toBe(verrou);
    expect((await appeler('PUT', 'jour/', { jour: '2026-10-30' })).json.code).toBe(verrou);
  });
});

describe('faux serveur Personnel : soumission et validation (US-123)', () => {
  it('seul le gérant soumet ; l’état soumis crée la demande DEM-022 liée à la paie', async () => {
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('POST', 'soumettre/')).statut).toBe(403);
    memoriserUtilisateurConnecte('willy');
    const r = await appeler('POST', 'soumettre/');
    expect(r.statut).toBe(200);
    expect(r.json).toMatchObject({ statut: 'soumis', soumisPar: 'Willy' });
    expect(r.json.demande.numero).toBe(22);
    expect((await appeler('POST', 'soumettre/')).json.code).toBe('deja_soumis');
    const demande = (await toutes()).find((d) => d.type === 'paie')!;
    expect(demande).toMatchObject({
      numero: 22,
      statut: 'en-attente',
      titre: 'État de paie · Octobre 2026',
      titreEn: 'Payroll · October 2026',
      objet: { genre: 'paie', mois: '2026-10' },
      par: 'Willy',
    });
    expect(String(demande.detail).replace(/\s/g, ' ')).toBe(
      '470 885 FCFA net · 8 employés · paie prévue le sam. 31 oct.',
    );
  });

  it('le gérant ne peut pas décider (403), le propriétaire valide : le paiement s’ouvre', async () => {
    await appeler('POST', 'soumettre/');
    const demande = (await toutes()).find((d) => d.type === 'paie')!;
    const decider = (accord: boolean) =>
      appeler('POST', `${demande.id}/decider/`, { accord }, '/api/v1/simulation/demandes/');
    expect((await decider(true)).statut).toBe(403);
    memoriserUtilisateurConnecte('fotso');
    expect((await decider(true)).statut).toBe(200);
    const paie = await lire();
    expect(paie).toMatchObject({ statut: 'valide', validePar: 'M. Fotso', demande: null });
    expect((await decider(false)).statut).toBe(409);
  });

  it('un refus remet l’état en brouillon, modifiable puis re-soumis (DEM-023)', async () => {
    await appeler('POST', 'soumettre/');
    const demande = (await toutes()).find((d) => d.type === 'paie')!;
    memoriserUtilisateurConnecte('fotso');
    await appeler(
      'POST',
      `${demande.id}/decider/`,
      { accord: false },
      '/api/v1/simulation/demandes/',
    );
    expect(await lire()).toMatchObject({ statut: 'brouillon', soumisPar: '', validePar: '' });
    memoriserUtilisateurConnecte('willy');
    expect(
      (
        await appeler('POST', 'ajustements/', {
          employe: 'davy',
          type: 'gain',
          libelle: 'a',
          montant: 5,
        })
      ).statut,
    ).toBe(200);
    expect((await appeler('POST', 'soumettre/')).json.demande.numero).toBe(23);
  });
});

describe('faux serveur Personnel : paiement (US-124, R12)', () => {
  it('refuse tout paiement avant la validation du propriétaire (409)', async () => {
    expect(
      (await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes' })).json.code,
    ).toBe('paiement_ferme');
    expect((await appeler('POST', 'paiements/restes/', { mode: 'especes' })).statut).toBe(409);
  });

  it('seul le gérant paie', async () => {
    await validee();
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes' })).statut).toBe(
      403,
    );
    expect((await appeler('POST', 'paiements/restes/', { mode: 'especes' })).statut).toBe(403);
  });

  it('un paiement partiel crée une dépense « Salaires » validée et laisse un reste', async () => {
    await validee();
    const r = await appeler('POST', 'paiements/', {
      employe: 'davy',
      mode: 'mobile',
      montant: 30_000,
    });
    expect(r.statut).toBe(200);
    expect(r.json.depenses).toEqual(['DEP-0017']);
    expect(r.json.instantane.statut).toBe('en-paiement');
    expect((await employe('davy')).paiements).toEqual([
      { montant: 30_000, mode: 'mobile', date: '2026-10-14', par: 'Willy' },
    ]);
    const depenses = (await appeler('GET', '', {}, '/api/v1/simulation/comptoir/depenses/')).json;
    expect(depenses.depenses[0]).toMatchObject({
      numero: 17,
      categorie: 'salaires',
      libelle: 'Salaire octobre 2026 · Davy',
      montant: 30_000,
      mode: 'mobile',
      statut: 'validee',
      semaine: 'S42',
      rattachement: { type: 'semaine' },
    });
    const salaires = depenses.budget.find((l: any) => l.categorie === 'salaires');
    expect(salaires.realise).toBe(30_000);
  });

  it('sans montant, solde l’employé ; au-delà du reste, 400 ; déjà soldé, 409', async () => {
    await validee();
    expect(
      (await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes', montant: 99_999 }))
        .json.code,
    ).toBe('montant_invalide');
    expect(
      (await appeler('POST', 'paiements/', { employe: 'davy', mode: 'cheque' })).json.code,
    ).toBe('mode_inconnu');
    expect(
      (await appeler('POST', 'paiements/', { employe: 'zorro', mode: 'especes' })).statut,
    ).toBe(404);
    await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes' });
    expect((await employe('davy')).paiements[0]!.montant).toBe(52_192);
    expect(
      (await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes' })).json.code,
    ).toBe('deja_paye');
  });

  it('payer tous les restes solde la paie et crée une dépense par salaire', async () => {
    await validee();
    await appeler('POST', 'paiements/', { employe: 'davy', mode: 'especes', montant: 2_000 });
    const r = await appeler('POST', 'paiements/restes/', { mode: 'banque' });
    expect(r.statut).toBe(200);
    expect(r.json.depenses).toHaveLength(8);
    expect(r.json.instantane.statut).toBe('payee');
    const davy = r.json.instantane.employes.find((e: any) => e.id === 'davy');
    expect(davy.paiements.map((p: any) => p.montant)).toEqual([2_000, 50_192]);
    expect((await appeler('POST', 'paiements/restes/', { mode: 'banque' })).statut).toBe(409);
    expect(journalPersonnel()[0]!.quoi).toContain('8 salaires payés');
  });
});
