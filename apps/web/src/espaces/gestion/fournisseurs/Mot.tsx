import type { ReactNode } from 'react';

import styles from './Fournisseurs.module.css';
import type { NiveauMot } from './regles.ts';

/** Pastille d'état : le libellé porte le sens, la couleur ne fait que le souligner. */
export function Mot({ niveau, children }: { niveau: NiveauMot; children: ReactNode }) {
  return (
    <span
      className={styles.mot}
      style={{ background: `var(--ob-${niveau}-fond)`, color: `var(--ob-${niveau}-texte)` }}
    >
      {children}
    </span>
  );
}
