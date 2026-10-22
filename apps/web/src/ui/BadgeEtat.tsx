import { Badge } from '@mantine/core';
import type { NiveauStatut } from '@/utils';

export type NiveauEtat = NiveauStatut;

/** L'état n'est jamais porté par la couleur seule : le libellé est obligatoire (CdC §8). */
export function BadgeEtat({ niveau, libelle }: { niveau: NiveauEtat; libelle: string }) {
  return (
    <Badge
      size="lg"
      variant="filled"
      bg={`var(--ob-${niveau}-fond)`}
      c={`var(--ob-${niveau}-texte)`}
      fw={700}
      tt="none"
      leftSection={
        <span
          aria-hidden
          style={{
            display: 'block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'currentColor',
          }}
        />
      }
    >
      {libelle}
    </Badge>
  );
}
