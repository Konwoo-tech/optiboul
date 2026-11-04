import { AVATARS, initiales, type NiveauStatut } from '@/utils';

import type { Profil } from '../../../profils.ts';
import styles from './Utilisateurs.module.css';

/** Pastille aux initiales, de la couleur du profil (le nom est toujours écrit à côté). */
export function Pastille({
  nom,
  profil,
  className = '',
}: {
  nom: string;
  profil?: Profil;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${styles.pastille} ${className}`}
      style={{ background: profil ? AVATARS[profil] : 'var(--ob-doux)' }}
    >
      {nom ? initiales(nom) : '?'}
    </span>
  );
}

/** Mot d'état : le libellé porte le sens, la couleur ne fait que le souligner. */
export function Mot({
  niveau,
  children,
  className = '',
}: {
  niveau: NiveauStatut;
  children: string;
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
