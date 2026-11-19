import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { curseurDe, lireJournalReel, PAGES_MAX } from './reel.ts';
import { SANS_FILTRE } from './types.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api) : pagination par curseur.
const LIGNE = (
  id: number,
  acteur: string,
  action: string,
  objet = '',
  horodatage = '2026-11-19T10:00:00+01:00',
) => ({
  id,
  horodatage,
  acteur: id,
  acteur_nom: acteur,
  profil: 'gerant',
  poste_id: null,
  poste_nom: '',
  entree: 'comptoir',
  action,
  objet_type: objet,
  objet_id: String(id),
  avant: null,
  apres: null,
});

describe('lecture du journal sur le vrai serveur', () => {
  it('suit le curseur, filtre auteur et famille ici, envoie la période au serveur', async () => {
    const adresses: string[] = [];
    serveur.use(
      http.get('*/api/v1/journal/', ({ request }) => {
        const url = new URL(request.url);
        adresses.push(url.search);
        return url.searchParams.get('cursor') === 'p2'
          ? HttpResponse.json({
              next: null,
              previous: null,
              results: [LIGNE(1, 'Davy', 'caisse.ouverte', 'caisse')],
            })
          : HttpResponse.json({
              next: 'http://localhost/api/v1/journal/?cursor=p2&du=2026-11-01',
              previous: null,
              results: [
                LIGNE(3, 'Willy', 'depense.saisie', 'depense'),
                LIGNE(2, 'Willy', 'connexion.reussie', 'utilisateur'),
              ],
            });
      }),
    );
    const tout = await lireJournalReel({ ...SANS_FILTRE, du: '2026-11-01' });
    expect(adresses).toEqual(['?du=2026-11-01', '?du=2026-11-01&cursor=p2']);
    expect(tout.total).toBe(3);
    expect(tout.auteurs).toEqual(['Davy', 'Willy']);
    expect(tout.entrees.map((e) => [e.id, e.type, e.codeAction])).toEqual([
      ['3', 'depense', 'depense.saisie'],
      ['2', 'connexion', 'connexion.reussie'],
      ['1', 'caisse', 'caisse.ouverte'],
    ]);
    expect(tout.entrees[0]).toMatchObject({
      auteur: 'Willy',
      profil: 'gerant',
      jour: '2026-11-19',
      heure: '10:00',
    });

    const dePierre = await lireJournalReel({ ...SANS_FILTRE, auteur: 'Davy', type: 'caisse' });
    expect(dePierre.entrees.map((e) => e.id)).toEqual(['1']);
    expect(dePierre.auteurs).toEqual(['Davy', 'Willy']);
  });

  it('ne lit pas plus de pages que le maximum', async () => {
    let appels = 0;
    serveur.use(
      http.get('*/api/v1/journal/', () => {
        appels += 1;
        return HttpResponse.json({
          next: `http://localhost/api/v1/journal/?cursor=c${appels}`,
          previous: null,
          results: [LIGNE(appels, 'Willy', 'caisse.ouverte', 'caisse')],
        });
      }),
    );
    const i = await lireJournalReel(SANS_FILTRE);
    expect(appels).toBe(PAGES_MAX);
    expect(i.total).toBe(PAGES_MAX);
  });

  it('le curseur d’une adresse', () => {
    expect(curseurDe('http://x/api/v1/journal/?cursor=abc&du=1')).toBe('abc');
    expect(curseurDe(null)).toBeUndefined();
    expect(curseurDe('http://x/api/v1/journal/')).toBeUndefined();
  });
});
