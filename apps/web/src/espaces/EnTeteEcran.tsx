import { useTranslation } from '@/i18n';
import { useContexteSimule } from '@/simulation';
import { EnTetePage, useCreneau, useHorloge } from '@/ui';
import { formaterDateCourte } from '@/utils';

import { cleTitre, type Ecran } from '../navigation.ts';

/**
 * En-tête d'un écran de l'espace : son titre et, en simulation, la ligne « semaine · gérant ·
 * production » (ou « ouverte à … par … » pour la session en cours), comme la maquette.
 */
export function EnTeteEcran({ ecran }: { ecran: Pick<Ecran, 'cle' | 'espace'> }) {
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

  return <EnTetePage kicker={kicker} titre={t(cleTitre(ecran), { session, date })} />;
}
