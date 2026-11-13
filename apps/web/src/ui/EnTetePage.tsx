import { useNetwork } from '@mantine/hooks';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { useContexte } from '@/coque/contexte.ts';
import { useNotificationsSimulees } from '@/simulation';
import type { Creneau } from '@/utils';
import { useState } from 'react';

import { BasculeApparence } from './BasculeApparence.tsx';
import styles from './EnTetePage.module.css';
import { PanneauNotifications } from './PanneauNotifications.tsx';
import { useCreneau } from './useCreneau.ts';

type Niveau = 'ok' | 'surveiller' | 'neutre';

function Pastille({ niveau, libelle }: { niveau: Niveau; libelle: string }) {
  return (
    <span
      className={styles.pastille}
      style={{ background: `var(--ob-${niveau}-fond)`, color: `var(--ob-${niveau}-texte)` }}
    >
      <span className={styles.point} />
      {libelle}
    </span>
  );
}

/**
 * Titre de l'écran, avec ce qu'il faut toujours savoir : notifications, session en cours,
 * réseau, langue et thème.
 */
export function EnTetePage({
  kicker,
  titre,
  session,
}: {
  kicker?: string;
  titre: string;
  /** Session affichée par l'écran (« Session en cours ») : elle prime sur celle du contexte. */
  session?: { creneau: Creneau; ouverte: boolean };
}) {
  const { t } = useTranslation();
  const { online } = useNetwork();
  const creneau = useCreneau();
  const { data: contexte } = useContexte();
  const [notificationsOuvertes, setNotificationsOuvertes] = useState(false);
  const { utilisateur } = useUtilisateurCourant();
  const { data: notifications = [] } = useNotificationsSimulees(utilisateur?.name);
  const nonLues = notifications.filter((notification) => !notification.lue).length;

  // « Session de nuit » / « Session de jour » (la connexion, elle, dit « Nuit » / « Jour »).
  const type = t(`creneau.${session?.creneau ?? contexte?.sessionType ?? creneau}`);
  const sessionOuverte = session ? session.ouverte : contexte?.sessionOuverte !== false;
  const enLigne = contexte ? t('coque.pastilleReseau') : t('etat.enLigne');

  return (
    <div className={styles.entete}>
      <div className={styles.texte}>
        {kicker && <div className={styles.kicker}>{kicker}</div>}
        <h1 className={styles.titre}>{titre}</h1>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.notifications}
          onClick={() => setNotificationsOuvertes(true)}
        >
          {t('coque.notifications')}
          {nonLues > 0 && <span className={styles.badge}>{nonLues}</span>}
        </button>
        <Pastille
          niveau={(session || contexte) && sessionOuverte ? 'ok' : 'neutre'}
          libelle={
            session || contexte
              ? t(sessionOuverte ? 'coque.pastilleSession' : 'coque.pastilleSessionCloturee', {
                  type,
                })
              : type
          }
        />
        <Pastille
          niveau={online ? 'ok' : 'surveiller'}
          libelle={online ? enLigne : t('etat.horsLigne')}
        />
        <div className={styles.apparence}>
          <BasculeApparence />
        </div>
      </div>
      <PanneauNotifications
        ouvert={notificationsOuvertes}
        onFermer={() => setNotificationsOuvertes(false)}
      />
    </div>
  );
}
