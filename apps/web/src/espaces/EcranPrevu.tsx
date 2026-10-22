import { Group, Kbd, Stack, Text } from '@mantine/core';
import { useTranslation } from '@/i18n';
import { BadgeEtat, Carte } from '@/ui';
import { RACCOURCIS_COMPTOIR } from '@/utils';

import type { Ecran } from '../navigation.ts';
import { EnTeteEcran } from './EnTeteEcran.tsx';

/** Page d'attente d'un écran : son titre, et le récit du backlog qui le livrera. */
export function EcranPrevu({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();

  const enSession = ecran.espace === 'comptoir' && ecran.cle === 'session';
  const statut = ecran.recit ? `${ecran.recit} · ${t('commun.bientot')}` : t('commun.bientot');

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <Carte>
        <Stack gap="sm" align="flex-start">
          <BadgeEtat niveau="neutre" libelle={statut} />
          {enSession && (
            <Group gap="md">
              {Object.entries(RACCOURCIS_COMPTOIR).map(([touche, action]) => (
                <Text key={touche} size="sm">
                  <Kbd>{touche}</Kbd> {action}
                </Text>
              ))}
            </Group>
          )}
        </Stack>
      </Carte>
    </>
  );
}
