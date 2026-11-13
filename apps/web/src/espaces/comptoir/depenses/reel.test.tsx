import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cleDepenses, enregistrerSurLeServeur } from './api.ts';
import {
  lireDepensesReelles,
  SEUIL_PAR_DEFAUT,
  versCategorie,
  versCodeCategorie,
  versDemandeDepense,
  versDepense,
  versStatutDemande,
} from './reel.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
const BOIS = {
  id: 1,
  numero: 1,
  code: 'DEP-0001',
  semaine: 1,
  categorie: 'matieres',
  libelle: 'Bois de chauffe',
  montant: 8000,
  paye_par: 'caisse',
  caisse: 2,
  rattachement: 'stock',
  production_jour: '2026-11-13',
  production_creneau: 'jour',
  matiere: 'bois',
  quantite: '2.000',
  fournisseur: "Marché d'Etoudi",
  justificatif: 'http://localhost/media/justificatifs/bois.jpg',
  achat_courant: '',
  pre_autorisation: null,
  statut: 'validee',
  demande: null,
  auteur: 'Davy Caisse',
  auteur_profil: 'caissier',
  cree_le: '2026-11-13T14:56:53.363967+01:00',
};
const PETRIN = {
  ...BOIS,
  id: 2,
  numero: 2,
  code: 'DEP-0002',
  categorie: 'technique',
  libelle: 'Réparation pétrin',
  montant: 60000,
  paye_par: 'banque',
  caisse: null,
  rattachement: 'semaine',
  production_jour: null,
  production_creneau: '',
  matiere: null,
  quantite: null,
  fournisseur: '',
  justificatif: null,
  statut: 'en_attente',
  demande: 'DEM-007',
  auteur: 'Willy Gérant',
  auteur_profil: 'gerant',
};
const DEMANDE = {
  id: 7,
  numero: 7,
  code: 'DEM-007',
  type: 'depense',
  type_libelle: 'Dépense au-dessus du seuil',
  objet_type: 'depense',
  objet_id: 2,
  objet: 'DEP-0002 · Réparation pétrin · 60000 FCFA',
  details: { numero: 'DEP-0002', montant: 60000 },
  motif: 'DEP-0002 · Réparation pétrin',
  emetteur: { id: 3, nom: 'Willy Gérant' },
  emetteur_profil: 'gerant',
  valideurs: ['proprietaire'],
  statut: 'en_attente',
  cree_le: '2026-11-13T14:56:53.698564+01:00',
  echeance: '2026-11-13T18:00:00+01:00',
  escaladee_le: null,
  decide_par_nom: '',
  decide_le: null,
};
const SEMAINE = {
  id: 1,
  code: 'S46',
  annee: 2026,
  numero: 46,
  du: '2026-11-09',
  au: '2026-11-15',
  statut: 'ouverte',
  gerant: { id: 3, nom: 'Willy Gérant', profil: 'gerant' },
  production: { id: 5, nom: 'Serge Production', profil: 'production' },
};
const BUDGET = {
  mois: '2026-11',
  lignes: [
    {
      categorie: 'matieres',
      libelle: 'Matières premières',
      budget: 900000,
      depense: 8000,
      part: 1,
      statut: 'ok',
    },
    {
      categorie: 'petit_materiel',
      libelle: 'Petit matériel',
      budget: 50000,
      depense: 0,
      part: 0,
      statut: 'ok',
    },
  ],
  budget: 950000,
  depense: 8000,
};
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

function serveurDepenses(options: { parametresRefuses?: boolean } = {}) {
  serveur.use(
    http.get('*/api/v1/depenses/', () => HttpResponse.json(page([BOIS, PETRIN]))),
    http.get('*/api/v1/budgets/', () => HttpResponse.json(BUDGET)),
    http.get('*/api/v1/semaines/', () => HttpResponse.json(page([SEMAINE]))),
    http.get('*/api/v1/fournisseurs/', () =>
      HttpResponse.json(
        page([
          {
            id: 4,
            nom: "Marché d'Etoudi",
            telephone: '677001202',
            conditions: 'Comptant',
            matieres: ['levure', 'bois', 'charbon'],
            actif: true,
            prochaine_reception: null,
            manquants: 0,
          },
        ]),
      ),
    ),
    http.get('*/api/v1/demandes/', ({ request }) => {
      expect(new URL(request.url).searchParams.get('type')).toBe('depense');
      return HttpResponse.json(page([DEMANDE, { ...DEMANDE, id: 8, objet_type: 'livraison' }]));
    }),
    http.get('*/api/v1/parametres/', () =>
      options.parametresRefuses
        ? HttpResponse.json({ detail: 'non' }, { status: 403 })
        : HttpResponse.json([
            {
              cle: 'seuil_validation_depenses',
              valeur: 75000,
              defaut: 50000,
              libelle: '',
              genre: '',
              unite: '',
              usage: '',
              choix: [],
              minimum: null,
              maximum: null,
              modifie_le: null,
              modifie_par: '',
            },
          ]),
    ),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({
        jour: '2026-11-13',
        creneau: 'jour',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: null,
      }),
    ),
  );
}

describe('lecture des dépenses sur le vrai serveur', () => {
  it('compose budget, dépenses, semaines, fournisseurs, demandes, seuil et session', async () => {
    serveurDepenses();
    const i = await lireDepensesReelles();
    expect(i.mois).toBe('2026-11');
    expect(i.seuil).toBe(75000);
    expect(i.semaineCourante).toEqual({ id: '1', numero: 46, du: '2026-11-09', au: '2026-11-15' });
    expect(i.gerantDeLaSemaine).toBe('Willy Gérant');
    expect(i.session).toEqual({ type: 'jour', date: '2026-11-13' });
    expect(i.budget).toEqual([
      { categorie: 'matieres', budget: 900000, realise: 8000 },
      { categorie: 'petit-materiel', budget: 50000, realise: 0 },
    ]);
    // La plus récente d'abord ; la matière inconnue d'un fournisseur est écartée.
    expect(i.depenses.map((d) => d.numero)).toEqual([2, 1]);
    expect(i.fournisseurs).toEqual([
      { id: '4', nom: "Marché d'Etoudi", matieres: ['levure', 'bois'] },
    ]);
    // Seule la demande de dépense est reprise.
    expect(i.demandes).toEqual([
      {
        id: '7',
        numero: 7,
        depenseId: '2',
        par: 'Willy Gérant',
        parProfil: 'gerant',
        statut: 'en-attente',
        emiseA: '14:56',
        decideePar: '',
        decideeLe: '',
        decideeA: '',
      },
    ]);
  });

  it('sans accès aux paramètres (hors propriétaire), le seuil par défaut s’applique', async () => {
    serveurDepenses({ parametresRefuses: true });
    expect((await lireDepensesReelles()).seuil).toBe(SEUIL_PAR_DEFAUT);
  });

  it('traduit une dépense de stock et une dépense en attente', () => {
    const code = (id: number) => (id === 1 ? 'S46' : `S${id}`);
    expect(versDepense(BOIS as never, code)).toEqual({
      id: '1',
      numero: 1,
      date: '2026-11-13',
      semaine: 'S46',
      categorie: 'matieres',
      libelle: 'Bois de chauffe',
      montant: 8000,
      mode: 'caisse',
      par: 'Davy Caisse',
      parProfil: 'caissier',
      statut: 'validee',
      photo: true,
      fournisseur: "Marché d'Etoudi",
      rattachement: {
        type: 'stock',
        matiere: 'bois',
        quantite: 2,
        session: { type: 'jour', date: '2026-11-13' },
      },
    });
    const attente = versDepense(PETRIN as never, code);
    expect(attente).toMatchObject({
      statut: 'en-attente',
      photo: false,
      rattachement: { type: 'semaine' },
    });
    expect(attente.fournisseur).toBeUndefined();
  });

  it('un achat au marché n’a pas de fournisseur à l’écran, et part avec « Marché »', async () => {
    const code = () => 'S46';
    expect(
      versDepense({ ...BOIS, fournisseur: 'Marché' } as never, code).fournisseur,
    ).toBeUndefined();
    serveurDepenses();
    const client = new QueryClient();
    let champs: Record<string, FormDataEntryValue> = {};
    serveur.use(
      http.post('*/api/v1/depenses/', async ({ request }) => {
        champs = Object.fromEntries((await request.formData()).entries());
        return HttpResponse.json({ ...BOIS, fournisseur: 'Marché' }, { status: 201 });
      }),
    );
    await enregistrerSurLeServeur(client, 'Davy', {
      categorie: 'matieres',
      libelle: 'Bois',
      montant: 8000,
      mode: 'caisse',
      photo: false,
      rattachement: 'stock',
      matiere: 'bois',
      quantite: 2,
    });
    expect(champs.fournisseur).toBe('Marché');
  });

  it('une demande acceptée ou refusée garde qui a décidé et quand', () => {
    expect(
      versDemandeDepense({
        ...DEMANDE,
        statut: 'accordee',
        decide_par_nom: 'Patron Dev',
        decide_le: '2026-11-13T16:10:00+01:00',
      } as never),
    ).toMatchObject({
      statut: 'acceptee',
      decideePar: 'Patron Dev',
      decideeLe: '2026-11-13',
      decideeA: '16:10',
    });
    expect(versStatutDemande('refusee')).toBe('refusee');
    expect(versStatutDemande('en_attente')).toBe('en-attente');
  });

  it('les catégories passent du serveur à l’écran et inversement', () => {
    expect(versCategorie('petit_materiel')).toBe('petit-materiel');
    expect(versCategorie('inconnue')).toBe('extra');
    expect(versCodeCategorie('petit-materiel')).toBe('petit_materiel');
  });
});

describe('enregistrement d’une dépense sur le vrai serveur', () => {
  it('envoie un formulaire multipart (fournisseur par son nom ; le fichier est joué à l’écran) avec une clé d’idempotence', async () => {
    serveurDepenses();
    const client = new QueryClient();
    client.setQueryData(cleDepenses('Davy'), await lireDepensesReelles());
    let champs: Record<string, FormDataEntryValue> = {};
    let cle: string | null = null;
    let type: string | null = null;
    serveur.use(
      http.post('*/api/v1/depenses/', async ({ request }) => {
        cle = request.headers.get('Idempotency-Key');
        type = request.headers.get('Content-Type');
        champs = Object.fromEntries((await request.formData()).entries());
        return HttpResponse.json(BOIS, { status: 201 });
      }),
    );
    const reponse = await enregistrerSurLeServeur(client, 'Davy', {
      categorie: 'petit-materiel',
      libelle: 'Bois de chauffe',
      montant: 8000,
      mode: 'caisse',
      photo: true,
      rattachement: 'stock',
      matiere: 'bois',
      quantite: 2,
      fournisseur: '4',
    });
    expect(type).toMatch(/^multipart\/form-data/);
    expect(cle).toBeTruthy();
    expect(champs).toMatchObject({
      categorie: 'petit_materiel',
      libelle: 'Bois de chauffe',
      montant: '8000',
      paye_par: 'caisse',
      rattachement: 'stock',
      matiere: 'bois',
      quantite: '2',
      fournisseur: "Marché d'Etoudi",
    });
    expect(reponse.depense).toMatchObject({ id: '1', numero: 1 });
    expect(reponse.demande).toBeUndefined();
  });

  it('au-dessus du seuil : la demande d’accord revient avec la dépense en attente', async () => {
    serveurDepenses();
    const client = new QueryClient();
    serveur.use(http.post('*/api/v1/depenses/', () => HttpResponse.json(PETRIN, { status: 201 })));
    const reponse = await enregistrerSurLeServeur(client, 'Willy', {
      categorie: 'technique',
      libelle: 'Réparation pétrin',
      montant: 60000,
      mode: 'banque',
      photo: false,
      rattachement: 'semaine',
    });
    expect(reponse.depense.statut).toBe('en-attente');
    expect(reponse.demande).toMatchObject({ id: '7', depenseId: '2', numero: 7 });
  });

  it('un refus du serveur remonte son code', async () => {
    const client = new QueryClient();
    serveur.use(
      http.post('*/api/v1/depenses/', () =>
        HttpResponse.json({ detail: 'Caisse fermée', code: 'caisse_fermee' }, { status: 409 }),
      ),
    );
    await expect(
      enregistrerSurLeServeur(client, 'Davy', {
        categorie: 'eau',
        libelle: 'Eau',
        montant: 1000,
        mode: 'caisse',
        photo: false,
        rattachement: 'semaine',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'caisse_fermee' });
  });
});
