import { useMediaQuery } from '@mantine/hooks';
import { memoriserMessageConnexion, useDeconnexionAutomatique } from '@/auth';
import { useTranslation } from '@/i18n';
import { configurationSimulee, deconnecterSimulation, SIMULATION } from '@/simulation';
import { BandeauHorsLigne, LimiteErreur } from '@/ui';
import { useQueryClient } from '@tanstack/react-query';
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
  const client = useQueryClient();
  const { inactiviteMinutes } = configurationSimulee();

  // Poste partagé : une session oubliée se ferme seule. Pour l'instant en simulation seulement ;
  // la vraie déconnexion passe par django-allauth.
  useDeconnexionAutomatique({
    minutes: inactiviteMinutes,
    actif: SIMULATION,
    onExpire: () => {
      memoriserMessageConnexion(t('connexion.inactivite', { minutes: inactiviteMinutes }));
      void deconnecterSimulation('inactivite').then(() => client.invalidateQueries());
    },
  });

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
