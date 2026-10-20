import { Alert } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { useTranslation } from '@/i18n';

/** Pastille « Hors ligne – tout fonctionne » et envois en attente (UX §5.2, R20). */
export function BandeauHorsLigne({ envoisEnAttente = 0 }: { envoisEnAttente?: number }) {
  const { online } = useNetwork();
  const { t } = useTranslation();
  if (online && envoisEnAttente === 0) return null;
  return (
    <Alert component="output" color={online ? 'yellow' : 'gray'} py="xs">
      {online ? null : `${t('etat.horsLigne')} · `}
      {t('etat.envoisEnAttente', { count: envoisEnAttente })}
    </Alert>
  );
}
