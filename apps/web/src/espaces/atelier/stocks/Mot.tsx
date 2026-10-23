import type { ReactNode } from 'react';

import styles from './Stocks.module.css';
import type { NiveauPastille } from './regles.ts';

/**
 * Pastille d'état : le libellé porte le sens, la couleur ne fait que le souligner. `cellule` : la
 * pastille est elle-même la cellule d'un tableau (comme dans la maquette).
 */
export function Mot({
  niveau,
  children,
  className = '',
  cellule = false,
}: {
  niveau: NiveauPastille;
  children: ReactNode;
  className?: string;
  cellule?: boolean;
}) {
  const Balise = cellule ? 'td' : 'span';
  return (
    <Balise
      className={`${styles.mot} ${className}`}
      style={{ background: `var(--ob-${niveau}-fond)`, color: `var(--ob-${niveau}-texte)` }}
    >
      {children}
    </Balise>
  );
}
