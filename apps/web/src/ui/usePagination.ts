import { useState } from 'react';

/** Taille de page des listes de l'application : assez courte pour un écran de comptoir. */
export const TAILLE_DE_PAGE = 10;

/**
 * Découpe une liste en pages. Changer `cle` (un filtre, une recherche) ramène à la première page ;
 * une page devenue trop haute (liste raccourcie) retombe sur la dernière.
 */
export function usePagination<T>(elements: readonly T[], cle = '', taille = TAILLE_DE_PAGE) {
  const [choix, setChoix] = useState({ cle, page: 1 });
  const pages = Math.max(1, Math.ceil(elements.length / taille));
  const demandee = choix.cle === cle ? choix.page : 1;
  const page = Math.min(demandee, pages);
  return {
    visibles: elements.slice((page - 1) * taille, page * taille),
    page,
    pages,
    total: elements.length,
    allerA: (suivante: number) => setChoix({ cle, page: Math.min(Math.max(1, suivante), pages) }),
  };
}
