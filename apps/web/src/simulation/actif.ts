/**
 * Mode simulation : l'application tourne sans backend, sur de fausses réponses de l'API
 * (`pnpm dev:simulation`). La constante est remplacée à la compilation : en production, tout
 * le code de simulation est retiré du paquet.
 */
export const SIMULATION = import.meta.env.MODE === 'simulation';
