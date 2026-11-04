import { utilisateursActifs } from './comptes.ts';
import type { UtilisateurSimule } from './donnees.ts';

const CLE = 'optiboul-simulation-utilisateur';

/** Repli si le navigateur interdit le stockage : la session dure jusqu'au rechargement. */
let enMemoire: string | null = null;

export function lireUtilisateurConnecte(): UtilisateurSimule | undefined {
  let id = enMemoire;
  try {
    id = sessionStorage.getItem(CLE) ?? id;
  } catch {
    // stockage indisponible
  }
  return utilisateursActifs().find((utilisateur) => utilisateur.id === id);
}

export function memoriserUtilisateurConnecte(id: string | null): void {
  enMemoire = id;
  try {
    if (id) sessionStorage.setItem(CLE, id);
    else sessionStorage.removeItem(CLE);
  } catch {
    // stockage indisponible
  }
}
