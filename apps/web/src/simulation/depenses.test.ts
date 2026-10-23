import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InstantaneDepenses } from '@/espaces/comptoir/depenses/types.ts';

import { journalComptoir } from './comptoir.ts';
import { journalDepenses } from './depenses.ts';
import { repondre, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';
import { mouvementsDeStock } from './stocks.ts';

const RACINE = '/api/v1/simulation/comptoir/depenses/';

async function appeler(methode: string, chemin = '', corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x${RACINE}${chemin}`), methode, corps);
  return { statut: reponse.status, json: (await reponse.json()) as Record<string, any> };
}

const lire = async () => (await appeler('GET')).json as unknown as InstantaneDepenses;

const SAISIE = {
  categorie: 'technique',
  libelle: 'Joint de porte',
  montant: 8000,
  mode: 'caisse',
  photo: true,
  rattachement: 'semaine',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  reinitialiserSimulation();
});
afterEach(() => vi.useRealTimers());

describe('faux serveur des dépenses : accès', () => {
  it('refuse sans connexion (403)', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET')).statut).toBe(403);
  });

  it('refuse au chef de production et à l’administrateur (403)', async () => {
    for (const id of ['serge', 'admin']) {
      memoriserUtilisateurConnecte(id);
      expect((await appeler('GET')).statut).toBe(403);
      expect((await appeler('POST', '', SAISIE)).statut).toBe(403);
    }
  });

  it('le propriétaire lit mais ne saisit pas (403)', async () => {
    memoriserUtilisateurConnecte('fotso');
    expect((await appeler('GET')).statut).toBe(200);
    const reponse = await appeler('POST', '', SAISIE);
    expect(reponse.statut).toBe(403);
    expect(reponse.json.code).toBe('droit_insuffisant');
    expect((await lire()).depenses).toHaveLength(8);
  });
});

describe('faux serveur des dépenses : lecture', () => {
  it('renvoie les huit dépenses de la maquette, la plus récente d’abord', async () => {
    memoriserUtilisateurConnecte('davy');
    const instantane = await lire();
    expect(instantane.depenses.map((d) => d.numero)).toEqual([16, 15, 14, 13, 12, 11, 10, 9]);
    expect(instantane.seuil).toBe(50_000);
    expect(instantane.semaineCourante.numero).toBe(42);
    expect(instantane.demandes).toHaveLength(1);
  });

  it('le budget ne compte que les dépenses validées', async () => {
    memoriserUtilisateurConnecte('davy');
    const { budget } = await lire();
    const ligne = (c: string) => budget.find((l) => l.categorie === c)!;
    // 2 980 000 déjà dépensés + levure 25 000 + glace 6 000 + bois 20 000.
    expect(ligne('matieres').realise).toBe(3_031_000);
    // Tôles 47 000 + soudure 52 000 ; le pétrin (65 000) attend sa validation.
    expect(ligne('technique').realise).toBe(99_000);
    expect(ligne('electricite').realise).toBe(148_500);
  });
});

describe('faux serveur des dépenses : saisie', () => {
  beforeEach(() => memoriserUtilisateurConnecte('davy'));

  it('numérote DEP-0017, rattache à la semaine 42 et trace l’action', async () => {
    const { statut, json } = await appeler('POST', '', SAISIE);
    expect(statut).toBe(200);
    expect(json.depense).toMatchObject({
      numero: 17,
      semaine: 'S42',
      par: 'Davy',
      parProfil: 'caissier',
      statut: 'validee',
      date: '2026-10-14',
    });
    expect(json.demande).toBeUndefined();
    expect(journalDepenses()[0]?.quoi).toContain('DEP-0017');
  });

  it('sous le seuil la dépense est validée, au seuil elle attend le gérant', async () => {
    expect((await appeler('POST', '', { ...SAISIE, montant: 49_999 })).json.depense.statut).toBe(
      'validee',
    );
    const { json } = await appeler('POST', '', { ...SAISIE, montant: 50_000 });
    expect(json.depense.statut).toBe('en-attente');
    expect(json.demande).toMatchObject({
      numero: 22,
      depenseId: json.depense.id,
      parProfil: 'caissier',
    });
    // Pas encore comptée dans le budget.
    const technique = json.instantane.budget.find((l: any) => l.categorie === 'technique');
    expect(technique.realise).toBe(99_000 + 49_999);
  });

  it('une dépense payée en caisse par la caissière entre dans la clôture de la session', async () => {
    const avant = journalComptoir().length;
    await appeler('POST', '', { ...SAISIE, montant: 8000 });
    const reponse = repondre(new URL('http://x/api/v1/simulation/comptoir/session/'), 'GET', {});
    const session = (await reponse.json()) as { depensesCaisse: number };
    expect(session.depensesCaisse).toBe(39_000);
    expect(journalComptoir().length).toBe(avant);
  });

  it('une dépense par banque ne touche pas la caisse', async () => {
    await appeler('POST', '', { ...SAISIE, mode: 'banque' });
    const reponse = repondre(new URL('http://x/api/v1/simulation/comptoir/session/'), 'GET', {});
    expect(((await reponse.json()) as { depensesCaisse: number }).depensesCaisse).toBe(31_000);
  });

  it('une entrée de stock crée le mouvement de stock avec son fournisseur', async () => {
    const { statut, json } = await appeler('POST', '', {
      ...SAISIE,
      categorie: 'matieres',
      libelle: 'Levure',
      rattachement: 'stock',
      matiere: 'levure',
      quantite: 2.5,
      fournisseur: 'f2',
    });
    expect(statut).toBe(200);
    expect(json.depense.rattachement).toMatchObject({
      type: 'stock',
      matiere: 'levure',
      quantite: 2.5,
    });
    expect(mouvementsDeStock()[0]).toMatchObject({
      type: 'entree',
      matiere: 'levure',
      quantite: 2.5,
      origine: {
        genre: 'depense',
        code: 'DEP-0017',
        achat: 'fournisseur',
        fournisseur: 'Mfoundi Levures & Sel',
      },
    });
  });

  it('refuse les saisies incomplètes ou incohérentes (400)', async () => {
    const code = async (corps: Record<string, unknown>) =>
      (await appeler('POST', '', corps)).json.code;
    expect(await code({ ...SAISIE, libelle: '  ' })).toBe('libelle_obligatoire');
    expect(await code({ ...SAISIE, montant: 0 })).toBe('montant_invalide');
    expect(await code({ ...SAISIE, montant: 12.5 })).toBe('montant_invalide');
    expect(await code({ ...SAISIE, categorie: 'autre' })).toBe('categorie_inconnue');
    expect(await code({ ...SAISIE, mode: 'cheque' })).toBe('mode_inconnu');
    expect(await code({ ...SAISIE, rattachement: undefined })).toBe('rattachement_obligatoire');
    expect(await code({ ...SAISIE, rattachement: 'stock', matiere: 'levure' })).toBe(
      'quantite_obligatoire',
    );
    expect(await code({ ...SAISIE, rattachement: 'stock', quantite: 1 })).toBe('matiere_inconnue');
    expect(
      await code({
        ...SAISIE,
        rattachement: 'stock',
        matiere: 'levure',
        quantite: 1,
        fournisseur: 'f4',
      }),
    ).toBe('fournisseur_invalide');
    expect((await lire()).depenses).toHaveLength(8);
  });

  it('le gérant saisit : sa dépense au seuil attend le propriétaire', async () => {
    memoriserUtilisateurConnecte('willy');
    const { json } = await appeler('POST', '', { ...SAISIE, montant: 60_000 });
    expect(json.depense).toMatchObject({ par: 'Willy', parProfil: 'gerant', statut: 'en-attente' });
    // Le gérant ne dépense pas « dans » la session : la caisse ne bouge pas.
    const reponse = repondre(new URL('http://x/api/v1/simulation/comptoir/session/'), 'GET', {});
    expect(((await reponse.json()) as { depensesCaisse: number }).depensesCaisse).toBe(31_000);
  });
});

describe('faux serveur des dépenses : décision', () => {
  it('le gérant ne décide pas de sa propre dépense (403), le propriétaire oui', async () => {
    memoriserUtilisateurConnecte('willy');
    expect((await appeler('POST', 'decision/', { demandeId: 'q1', accord: true })).statut).toBe(
      403,
    );
    memoriserUtilisateurConnecte('fotso');
    const { statut, json } = await appeler('POST', 'decision/', { demandeId: 'q1', accord: true });
    expect(statut).toBe(200);
    expect(json.demande).toMatchObject({ statut: 'acceptee', decideePar: 'M. Fotso' });
    const pretrin = json.instantane.depenses.find((d: any) => d.id === 'e3');
    expect(pretrin.statut).toBe('validee');
    // Le pétrin (65 000) entre alors dans le budget technique.
    expect(json.instantane.budget.find((l: any) => l.categorie === 'technique').realise).toBe(
      164_000,
    );
  });

  it('un refus rend la dépense « refusée » et la sort de la caisse', async () => {
    memoriserUtilisateurConnecte('davy');
    const cree = await appeler('POST', '', { ...SAISIE, montant: 60_000 });
    memoriserUtilisateurConnecte('willy');
    const { json } = await appeler('POST', 'decision/', {
      demandeId: cree.json.demande.id,
      accord: false,
    });
    expect(json.demande.statut).toBe('refusee');
    expect(json.instantane.depenses[0].statut).toBe('refusee');
    const reponse = repondre(new URL('http://x/api/v1/simulation/comptoir/session/'), 'GET', {});
    expect(((await reponse.json()) as { depensesCaisse: number }).depensesCaisse).toBe(31_000);
  });

  it('la caissière ne décide pas (403) et on ne décide pas deux fois (409)', async () => {
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('POST', 'decision/', { demandeId: 'q1', accord: true })).statut).toBe(
      403,
    );
    memoriserUtilisateurConnecte('fotso');
    await appeler('POST', 'decision/', { demandeId: 'q1', accord: true });
    expect((await appeler('POST', 'decision/', { demandeId: 'q1', accord: false })).statut).toBe(
      409,
    );
    expect((await appeler('POST', 'decision/', { demandeId: 'zz', accord: true })).statut).toBe(
      404,
    );
  });
});

/** Espèces attendues de la caisse ouverte, lues comme l'écran des caisses les lit. */
async function especesAttendues(): Promise<number> {
  const reponse = repondre(new URL('http://x/api/v1/simulation/caisses/'), 'GET', {});
  return ((await reponse.json()) as { detail: { attendu: number } }).detail.attendu;
}

const sessionApi = (methode: string, chemin: string, corps: Record<string, unknown> = {}) =>
  repondre(new URL(`http://x/api/v1/simulation/comptoir/session/${chemin}`), methode, corps);

const depensesDeLaSession = async () =>
  ((await sessionApi('GET', '').json()) as { depensesCaisse: number }).depensesCaisse;

function cloturerLaSession() {
  memoriserUtilisateurConnecte('davy');
  sessionApi('PUT', 'comptage/', { especes: '22950' });
  expect(sessionApi('POST', 'cloturer/', {}).status).toBe(200);
}

describe('faux serveur des dépenses : espèces de la caisse', () => {
  beforeEach(() => memoriserUtilisateurConnecte('davy'));

  it('une dépense en caisse diminue les espèces attendues, son refus les rend', async () => {
    expect(await especesAttendues()).toBe(22_950);
    const cree = await appeler('POST', '', { ...SAISIE, montant: 60_000 });
    expect(await especesAttendues()).toBe(-37_050);
    memoriserUtilisateurConnecte('willy');
    await appeler('POST', 'decision/', { demandeId: cree.json.demande.id, accord: false });
    expect(await especesAttendues()).toBe(22_950);
  });

  it('une dépense par banque ne change pas les espèces attendues', async () => {
    await appeler('POST', '', { ...SAISIE, mode: 'banque' });
    expect(await especesAttendues()).toBe(22_950);
  });

  it('sans session ouverte, la dépense n’entre ni dans la clôture ni dans la caisse', async () => {
    cloturerLaSession();
    const { statut } = await appeler('POST', '', { ...SAISIE, montant: 8000 });
    expect(statut).toBe(200);
    expect(await especesAttendues()).toBe(22_950);
    expect(await depensesDeLaSession()).toBe(31_000);
  });

  it('un refus après clôture ne retire plus rien de la caisse comptée', async () => {
    const cree = await appeler('POST', '', { ...SAISIE, montant: 60_000 });
    cloturerLaSession();
    memoriserUtilisateurConnecte('willy');
    await appeler('POST', 'decision/', { demandeId: cree.json.demande.id, accord: false });
    expect(await depensesDeLaSession()).toBe(91_000);
  });

  it('un refus après réouverture ne retire rien non plus', async () => {
    const cree = await appeler('POST', '', { ...SAISIE, montant: 60_000 });
    cloturerLaSession();
    memoriserUtilisateurConnecte('willy');
    expect(sessionApi('POST', 'rouvrir/', {}).status).toBe(200);
    await appeler('POST', 'decision/', { demandeId: cree.json.demande.id, accord: false });
    expect(await depensesDeLaSession()).toBe(91_000);
  });
});
