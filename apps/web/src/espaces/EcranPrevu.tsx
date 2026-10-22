import { Group, Kbd, Stack, Text } from '@mantine/core';
import { useTranslation } from '@/i18n';
import { useContexteSimule } from '@/simulation';
import { BadgeEtat, Carte, EnTetePage, useCreneau, useHorloge } from '@/ui';
import { formaterDateCourte, RACCOURCIS_COMPTOIR } from '@/utils';

import { cleTitre, type Ecran } from '../navigation.ts';

/** Page d'attente d'un écran : son titre, et le récit du backlog qui le livrera. */
export function EcranPrevu({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const { data: contexte } = useContexteSimule();
  const creneau = useCreneau();
  const maintenant = useHorloge();

  const session = t(`creneau.${creneau}`);
  const date = formaterDateCourte(maintenant, i18n.language);
  const formatDate = (iso: string) => formaterDateCourte(new Date(iso), i18n.language);
  const enSession = ecran.espace === 'comptoir' && ecran.cle === 'session';
  const kicker = !contexte
    ? undefined
    : enSession
      ? t('coque.kickerSession', {
          heure: contexte.sessionOuverteDepuis,
          nom: contexte.caissierDeSession,
        })
      : t('coque.kickerSemaine', {
          numero: contexte.semaine.numero,
          du: formatDate(contexte.semaine.du),
          au: formatDate(contexte.semaine.au),
          gerant: contexte.gerantDeLaSemaine,
          production: contexte.responsableProduction,
        });
  const statut = ecran.recit ? `${ecran.recit} · ${t('commun.bientot')}` : t('commun.bientot');

  return (
    <>
      <EnTetePage kicker={kicker} titre={t(cleTitre(ecran), { session, date })} />
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
