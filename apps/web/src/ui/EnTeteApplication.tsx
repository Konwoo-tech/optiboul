import { Group, Text, Title } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { useTranslation } from '@/i18n';
import type { ReactNode } from 'react';

import { BadgeEtat } from './BadgeEtat.tsx';
import { useCreneau } from './useCreneau.ts';
import { COULEURS } from './theme.ts';

/** Toujours savoir qui et où : application, créneau, état en ligne (UX §5.1). */
export function EnTeteApplication({ titre, actions }: { titre: string; actions?: ReactNode }) {
  const { t } = useTranslation();
  const { online } = useNetwork();
  const creneau = useCreneau();
  return (
    <Group justify="space-between" px="md" py="sm" bg={COULEURS.chocolat} c={COULEURS.creme}>
      <Group gap="sm">
        <Title order={3} c={COULEURS.or}>
          OptiBoul
        </Title>
        <Text fw={600}>{titre}</Text>
      </Group>
      <Group gap="sm">
        <Text size="sm">{t(`creneau.${creneau}`)}</Text>
        <BadgeEtat
          niveau={online ? 'ok' : 'surveiller'}
          libelle={online ? t('etat.enLigne') : t('etat.horsLigne')}
        />
        {actions}
      </Group>
    </Group>
  );
}
