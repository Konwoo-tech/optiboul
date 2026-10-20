import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** Réponses par défaut de l'API, à compléter par chaque test. */
export const gestionnaires = [
  http.get('*/api/v1/sante/', () => HttpResponse.json({ statut: 'ok', base: true })),
];

export const creerServeurApi = (...supplementaires: Parameters<typeof setupServer>) =>
  setupServer(...supplementaires, ...gestionnaires);
