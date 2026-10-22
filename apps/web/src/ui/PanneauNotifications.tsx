import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import {
  marquerNotificationsLues,
  useNotificationsSimulees,
  type NotificationVue,
} from '@/simulation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { cheminEcran } from '../navigation.ts';
import styles from './PanneauNotifications.module.css';

type Props = { ouvert: boolean; onFermer: () => void };

/**
 * Tiroir des notifications de la personne connectée, repris de la maquette. Chaque fonction
 * (commandes, production, stocks…) y ajoutera les siennes ; en attendant, elles sont simulées.
 */
export function PanneauNotifications({ ouvert, onFermer }: Props) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const naviguer = useNavigate();
  const { utilisateur } = useUtilisateurCourant();
  const { data: notifications = [] } = useNotificationsSimulees(utilisateur?.name);
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDialogElement>(null);
  // Le parent recrée `onFermer` à chaque rendu : on le lit par une référence pour que l'effet
  // ne se relance (et ne rappelle focus()) qu'à l'ouverture et à la fermeture.
  const fermer = useRef(onFermer);
  useEffect(() => {
    fermer.current = onFermer;
  }, [onFermer]);

  useEffect(() => {
    if (!ouvert) return;
    const declencheur =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    boutonFermer.current?.focus();
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        fermer.current();
        return;
      }
      if (evenement.key !== 'Tab' || !panneau.current) return;
      // Le focus reste dans le tiroir tant qu'il est ouvert.
      const cibles = panneau.current.querySelectorAll<HTMLElement>('button:not([disabled])');
      const premiere = cibles[0];
      const derniere = cibles[cibles.length - 1];
      if (!premiere || !derniere) return;
      if (evenement.shiftKey && document.activeElement === premiere) {
        evenement.preventDefault();
        derniere.focus();
      } else if (!evenement.shiftKey && document.activeElement === derniere) {
        evenement.preventDefault();
        premiere.focus();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
      declencheur?.focus();
    };
  }, [ouvert]);

  if (!ouvert) return null;

  const profil = utilisateur?.profil;
  const nonLues = notifications.filter((n) => !n.lue);
  const marquer = async (ids: string[]) => {
    await marquerNotificationsLues(ids);
    await client.invalidateQueries({ queryKey: ['simulation', 'notifications'] });
  };
  const ouvrirEcran = async (notification: NotificationVue) => {
    if (!notification.destination) return;
    await marquer([notification.id]);
    onFermer();
    void naviguer(cheminEcran(notification.destination));
  };
  const langue = i18n.language === 'en' ? 'en' : 'fr';

  return (
    <>
      <div className={styles.voile} onClick={onFermer} aria-hidden />
      <dialog
        open
        ref={panneau}
        aria-modal="true"
        className={styles.panneau}
        aria-label={t('coque.notifications')}
      >
        <div className={styles.entete}>
          <div className={styles.titres}>
            <div className={styles.titre}>{t('coque.notifications')}</div>
            {utilisateur && profil && (
              <div className={styles.sousTitre}>
                {t('coque.notificationsPour', {
                  nom: utilisateur.name,
                  role: t(`profils.${profil}`),
                })}
              </div>
            )}
          </div>
          <div className={styles.actions}>
            {nonLues.length > 0 && (
              <button
                type="button"
                className={styles.fermer}
                onClick={() => void marquer(notifications.map((n) => n.id))}
              >
                {t('coque.toutMarquerLu')}
              </button>
            )}
            <button type="button" ref={boutonFermer} className={styles.fermer} onClick={onFermer}>
              {t('navigation.fermer')}
            </button>
          </div>
        </div>
        <div className={styles.liste}>
          {notifications.map((notification) => {
            const texte = notification[langue];
            return (
              <div
                key={notification.id}
                className={styles.carte}
                style={{ borderColor: notification.lue ? 'var(--ob-ligne)' : '#F2B705' }}
              >
                <span
                  className={styles.pastille}
                  style={{ background: notification.lue ? 'transparent' : '#C2453A' }}
                />
                <div className={styles.corps}>
                  <div className={styles.ligneType}>
                    <span
                      className={`${styles.type} ${notification.enDirect ? styles.typeEnDirect : ''}`}
                    >
                      {texte.type}
                    </span>
                    <span className={styles.heure}>{texte.heure}</span>
                  </div>
                  <div className={styles.titreCarte}>{texte.titre}</div>
                  <div className={styles.detail}>{texte.detail}</div>
                  {notification.destination && (
                    <button
                      type="button"
                      className={styles.ouvrir}
                      onClick={() => void ouvrirEcran(notification)}
                    >
                      {t('coque.ouvrir')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {notifications.length === 0 && (
            <div className={styles.vide}>{t('coque.aucuneNotification')}</div>
          )}
        </div>
        <div className={styles.regle}>{t('coque.notificationsRegle')}</div>
      </dialog>
    </>
  );
}
