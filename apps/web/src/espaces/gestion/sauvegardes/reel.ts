import {
  sauvegardesEtatRetrieve,
  sauvegardesList,
  toutesLesPages,
  type EtatSauvegardes,
  type Sauvegarde,
} from '@/api';

import type { Copie, Declencheur, GenreCopie, InstantaneSauvegardes } from './types.ts';

/*
 * Lecture de « Gestion › Sauvegardes » sur le vrai serveur : `sauvegardes/` (copies faites) et
 * `sauvegardes/etat/` (dernière copie locale et cloud, alerte). Le serveur lance la sauvegarde en
 * tâche de fond (202) ; la restauration est synchrone (voir `api.ts`).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Les trois clôtures du serveur n'en font qu'une pour l'écran. */
const DECLENCHEURS: Record<string, Declencheur> = {
  planifiee: 'planifiee',
  cloture_caisse: 'cloture',
  cloture_production: 'cloture',
  cloture_semaine: 'cloture',
  manuelle: 'manuelle',
  avant_restauration: 'avant_restauration',
};

export function versCopie(s: Sauvegarde): Copie {
  return {
    id: String(s.id),
    genre: s.genre as GenreCopie,
    declencheur: DECLENCHEURS[s.declencheur] ?? 'manuelle',
    instant: s.fin ?? s.debut,
  };
}

export async function lireSauvegardesReelles(): Promise<InstantaneSauvegardes> {
  const [liste, etat] = await Promise.all([
    toutesLesPages<Sauvegarde>((page) => sauvegardesList({ page }) as Promise<Page<Sauvegarde>>),
    sauvegardesEtatRetrieve().then((r) => r.data as unknown as EtatSauvegardes),
  ]);
  return {
    copies: liste
      .filter((s) => s.statut === 'reussie')
      .map(versCopie)
      .sort((a, b) => b.instant.localeCompare(a.instant)),
    derniereLocale: etat.derniere_locale,
    derniereCloud: etat.derniere_cloud,
    cloudEnRetard: etat.cloud_en_retard,
    seuilAlerteHeures: etat.seuil_alerte_heures,
  };
}
