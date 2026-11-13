import type { ClientSimule } from '@/simulation';

import type { Profil } from '../../profils.ts';

/** Filtres de la liste : tous, ceux qui doivent de l'argent, ceux qui dépassent le plafond. */
export type FiltreClients = 'tous' | 'dette' | 'depasse';

export const FILTRES: readonly FiltreClients[] = ['tous', 'dette', 'depasse'];

/** Situation d'un client face à son plafond de dette. */
export type StatutClient = 'ajour' | 'dette' | 'depasse';

/** Niveau de couleur (pastilles et jauge) de chaque statut, d'après la palette des états. */
export const NIVEAU_DU_STATUT = {
  ajour: 'ok',
  dette: 'surveiller',
  depasse: 'bloquant',
} as const satisfies Record<StatutClient, 'ok' | 'surveiller' | 'bloquant'>;

/** Clé de traduction du libellé de chaque statut. */
export const LIBELLE_DU_STATUT = {
  ajour: 'clients.statutAJour',
  dette: 'clients.statutDette',
  depasse: 'clients.statutDepasse',
} as const satisfies Record<StatutClient, string>;

/**
 * Statut d'après le solde (négatif = dette) : « Plafond dépassé » seulement au-delà du plafond
 * (une dette exactement égale au plafond reste une simple dette), « Dette » dès le premier franc.
 */
export function statutDeSolde(solde: number, plafond: number): StatutClient {
  if (solde < -plafond) return 'depasse';
  if (solde < 0) return 'dette';
  return 'ajour';
}

/** Clients qui doivent de l'argent. */
export const enDette = (clients: readonly ClientSimule[]) => clients.filter((c) => c.solde < 0);

/** Le plafond de ce client : le sien s'il en a un, sinon celui de la liste. */
export const plafondDe = (client: Pick<ClientSimule, 'plafond'>, parDefaut: number): number =>
  client.plafond ?? parDefaut;

/** Clients dont la dette dépasse leur plafond. */
export const auDelaDuPlafond = (clients: readonly ClientSimule[], plafond: number) =>
  clients.filter((c) => c.solde < -plafondDe(c, plafond));

/** Total des dettes, négatif (somme des soldes négatifs). */
export const totalDesDettes = (clients: readonly ClientSimule[]): number =>
  enDette(clients).reduce((somme, c) => somme + c.solde, 0);

/** Clients du filtre, du plus endetté au moins endetté (le tri garde l'ordre d'origine à égalité). */
export function filtrerClients(
  clients: readonly ClientSimule[],
  filtre: FiltreClients,
  plafond: number,
): ClientSimule[] {
  const retenus =
    filtre === 'dette'
      ? enDette(clients)
      : filtre === 'depasse'
        ? auDelaDuPlafond(clients, plafond)
        : [...clients];
  return retenus.sort((a, b) => a.solde - b.solde);
}

/** Nombre de clients de chaque filtre, affiché sur les boutons de filtre. */
export function compteursDeFiltres(
  clients: readonly ClientSimule[],
  plafond: number,
): Record<FiltreClients, number> {
  return {
    tous: clients.length,
    dette: enDette(clients).length,
    depasse: auDelaDuPlafond(clients, plafond).length,
  };
}

/** Remplissage de la jauge, de 0 à 100 : dette / plafond, plafonné à 100 (sans dette : vide). */
export function remplissageJauge(solde: number, plafond: number): number {
  if (solde >= 0) return 0;
  if (plafond <= 0) return 100;
  return Math.min(100, (-solde / plafond) * 100);
}

/**
 * Seuls le gérant et le propriétaire relancent les clients (WhatsApp) ; la caissière voit les
 * dettes sans relancer. Affichage seulement : l'API vérifie le droit.
 */
export function peutRelancer(profil: Profil | null | undefined): boolean {
  return profil === 'gerant' || profil === 'proprietaire';
}
