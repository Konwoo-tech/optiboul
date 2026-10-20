import { Badge } from '@mantine/core';

export type NiveauEtat = 'ok' | 'surveiller' | 'bloquant';

const COULEUR: Record<NiveauEtat, string> = { ok: 'green', surveiller: 'yellow', bloquant: 'red' };

/** L'état n'est jamais porté par la couleur seule : le libellé est obligatoire (CdC §8). */
export function BadgeEtat({ niveau, libelle }: { niveau: NiveauEtat; libelle: string }) {
  return (
    <Badge color={COULEUR[niveau]} variant="light">
      {libelle}
    </Badge>
  );
}
