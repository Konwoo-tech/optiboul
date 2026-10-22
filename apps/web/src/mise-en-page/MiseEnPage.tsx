import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from '@/i18n';
import { SIMULATION } from '@/simulation';
import { BandeauHorsLigne, LimiteErreur } from '@/ui';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';

import styles from './MiseEnPage.module.css';
import { BarreLaterale, BarreTelephone } from './Navigation.tsx';

/**
 * Cadre commun : menu de gauche sur ordinateur, barre du haut avec un bouton « Menu » sur
 * téléphone (le propriétaire et le gérant suivent l'activité depuis leur téléphone, ADR-19).
 */
export function MiseEnPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const telephone = useMediaQuery('(max-width: 767px)') ?? false;

  return (
    <div className={`${styles.coque} ${telephone ? styles.coqueTelephone : ''}`}>
      {telephone ? <BarreTelephone /> : <BarreLaterale />}
      <main className={styles.principal}>
        <BandeauHorsLigne />
        <LimiteErreur reinitialiser={pathname}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </LimiteErreur>
      </main>
      {SIMULATION && (
        <div className={styles.simulation} data-simulation>
          {t('commun.simulation')}
        </div>
      )}
    </div>
  );
}
