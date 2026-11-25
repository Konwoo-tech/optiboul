import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { lireJournalReel } from './reel.ts';
import { LIMITE_AFFICHEE, SANS_FILTRE } from './types.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api) : total, famille, libellés, objet.
const LIGNE = (id: number, acteur: string, action: string, famille: string, libelle: string) => ({
  id,
  horodatage: '2026-11-19T10:00:00+01:00',
  acteur: id,
  acteur_nom: acteur,
  profil: 'gerant',
  poste_id: null,
  poste_nom: '',
  entree: 'comptoir',
  action,
  libelle,
  libelle_en: `EN ${libelle}`,
  famille,
  objet_type: famille,
  objet_id: String(id),
  objet_libelle: `Objet ${id}`,
  avant: null,
  apres: null,
});
const ACTEURS = [
  { id: 4, nom: 'Davy', profil: 'caissier' },
  { id: 3, nom: 'Willy', profil: 'gerant' },
];

describe('lecture du journal sur le vrai serveur', () => {
  it('une page : total du serveur, filtres envoyés (période, auteur par identifiant, famille)', async () => {
    const adresses: string[] = [];
    serveur.use(
      http.get('*/api/v1/journal/acteurs/', () => HttpResponse.json(ACTEURS)),
      http.get('*/api/v1/journal/', ({ request }) => {
        adresses.push(new URL(request.url).search);
        return HttpResponse.json({
          next: null,
          previous: null,
          total: 214,
          results: [
            LIGNE(3, 'Willy', 'depense.saisie', 'depense', 'Dépense saisie'),
            LIGNE(2, 'Davy', 'caisse.ouverte', 'caisse', 'Caisse ouverte'),
          ],
        });
      }),
    );
    const tout = await lireJournalReel({ ...SANS_FILTRE, du: '2026-11-01' });
    expect(adresses).toEqual([`?du=2026-11-01&page_size=${LIMITE_AFFICHEE}`]);
    // Le total est celui du serveur (toutes pages), pas le nombre de lignes lues.
    expect(tout.total).toBe(214);
    expect(tout.auteurs).toEqual(['Davy', 'Willy']);
    expect(tout.entrees.map((e) => [e.id, e.type, e.texte, e.objet])).toEqual([
      ['3', 'depense', 'Dépense saisie', 'Objet 3'],
      ['2', 'caisse', 'Caisse ouverte', 'Objet 2'],
    ]);
    expect(tout.entrees[0]).toMatchObject({ auteur: 'Willy', jour: '2026-11-19', heure: '10:00' });

    await lireJournalReel({ ...SANS_FILTRE, auteur: 'Davy', type: 'caisse' });
    expect(adresses[1]).toBe(`?auteur=4&famille=caisse&page_size=${LIMITE_AFFICHEE}`);
  });

  it('sans la liste des acteurs, le journal se lit quand même (auteur non filtrable)', async () => {
    serveur.use(
      http.get('*/api/v1/journal/acteurs/', () =>
        HttpResponse.json({ detail: 'x', code: 'droit_insuffisant' }, { status: 403 }),
      ),
      http.get('*/api/v1/journal/', () =>
        HttpResponse.json({
          next: null,
          previous: null,
          total: 1,
          results: [LIGNE(1, 'Willy', 'caisse.ouverte', 'caisse', 'Caisse ouverte')],
        }),
      ),
    );
    const i = await lireJournalReel(SANS_FILTRE);
    expect(i.entrees).toHaveLength(1);
    expect(i.auteurs).toEqual([]);
  });
});
