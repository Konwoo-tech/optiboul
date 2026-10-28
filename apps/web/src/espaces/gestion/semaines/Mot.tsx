import type { NiveauStatut } from '@/utils';
import type { ReactNode } from 'react';

import styles from './Semaines.module.css';

/** Pastille d'état : le libellé porte le sens, la couleur ne fait que le souligner. */
export function Mot({
  niveau,
  children,
  className = '',
}: {
  niveau: NiveauStatut;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`${styles.mot} ${className}`}
      style={{ background: `var(--ob-${niveau}-fond)`, color: `var(--ob-${niveau}-texte)` }}
    >
      {children}
    </span>
  );
}
