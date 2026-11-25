import { useMediaQuery } from '@mantine/hooks';
import { connexionDeconnexionCreate, useConnexionSessionRetrieve } from '@/api';
import { memoriserMessageConnexion, useDeconnexionAutomatique } from '@/auth';
import { useTranslation } from '@/i18n';
import { BandeauHorsLigne, LimiteErreur } from '@/ui';
import { useAppliquerPreferences } from '@/ui/preferences.ts';
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
  // Poste partagé : une session oubliée se ferme seule. Le délai vient du serveur (connexion par
  // code seulement : `null` pour une connexion par e-mail ou Google, qui n'a pas de minuteur).
  const session = useConnexionSessionRetrieve({
    query: { staleTime: Infinity, retry: false },
  });
  const inactiviteMinutes =
    (session.data?.data as { inactiviteMinutes?: number | null } | undefined)?.inactiviteMinutes ??
    0;

  // Thème et langue de la personne connectée (mémorisés côté serveur, US-004).
  useAppliquerPreferences();

  useDeconnexionAutomatique({
    minutes: inactiviteMinutes,
    actif: inactiviteMinutes > 0,
    onExpire: () => {
      memoriserMessageConnexion(t('connexion.inactivite', { minutes: inactiviteMinutes }));
      // Le serveur journalise `connexion.expiree` (et non `connexion.fermee`) : #299.
      void connexionDeconnexionCreate({ raison: 'inactivite' }).then(() => client.resetQueries());
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
    </div>
  );
}
