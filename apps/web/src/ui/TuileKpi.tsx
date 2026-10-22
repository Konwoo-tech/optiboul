import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

import { Carte } from './Carte.tsx';

type Props = {
  libelle: string;
  valeur: ReactNode;
  /** Précision sous la valeur (ex. « 3 clients au-delà du plafond »). */
  detail?: ReactNode;
};

/** Chiffre clé : libellé discret, grande valeur, précision facultative. */
export function TuileKpi({ libelle, valeur, detail }: Props) {
  return (
    <Carte>
      <Text size="sm" fw={700} c="dimmed">
        {libelle}
      </Text>
      <Text fz={30} fw={800} lh={1.2} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {valeur}
      </Text>
      {detail && (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      )}
    </Carte>
  );
}
