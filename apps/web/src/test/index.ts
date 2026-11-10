import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** Réponses par défaut de l'API, à compléter par chaque test. */
export const gestionnaires = [
  http.get('*/api/v1/sante/', () => HttpResponse.json({ statut: 'ok', base: true })),
  // Par défaut, le navigateur n'est pas un poste de confiance : la connexion propose l'e-mail.
  http.get('*/api/v1/connexion/utilisateurs/', () =>
    HttpResponse.json(
      { detail: "Ce poste n'est pas un poste de confiance.", code: 'poste_non_reconnu' },
      { status: 403 },
    ),
  ),
];

export const creerServeurApi = (...supplementaires: Parameters<typeof setupServer>) =>
  setupServer(...supplementaires, ...gestionnaires);
