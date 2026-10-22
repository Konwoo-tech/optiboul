import { AVATARS, initiales } from '@/utils';

import type { Profil } from '../profils.ts';

type Props = { nom: string; profil: Profil; taille?: number };

/** Taille de l'initiale selon la pastille (maquette : 44 → 15, 72 → 24, 56 → 18…). */
const CORPS: Record<number, number> = { 34: 12, 36: 13, 40: 14, 44: 15, 56: 18, 72: 24 };

/** Pastille aux initiales, de la couleur du profil. Le nom est toujours écrit à côté. */
export function AvatarUtilisateur({ nom, profil, taille = 44 }: Props) {
  return (
    <span
      aria-hidden
      style={{
        width: taille,
        height: taille,
        flex: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: CORPS[taille] ?? Math.round(taille * 0.34),
        color: '#2E1A10',
        background: AVATARS[profil],
      }}
    >
      {initiales(nom)}
    </span>
  );
}
