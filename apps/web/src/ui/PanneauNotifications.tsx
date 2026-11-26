import { useUtilisateurCourant } from '@/auth';
import {
  useNotifications,
  useNotificationsRegroupees,
  type GroupeAffiche,
  type NotificationAffichee,
} from '@/coque/notifications.ts';
import { useTranslation } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import styles from './PanneauNotifications.module.css';

type Props = { ouvert: boolean; onFermer: () => void };

/**
 * Tiroir des notifications de la personne connectée, repris de la maquette. Chaque fonction
 * (commandes, production, stocks…) y ajoute les siennes, celles du serveur.
 */
export function PanneauNotifications({ ouvert, onFermer }: Props) {
  const { t } = useTranslation();
  const naviguer = useNavigate();
  const { utilisateur } = useUtilisateurCourant();
  const { notifications, marquerLues, toutMarquerLu } = useNotifications(ouvert);
  const { groupes, marquerGroupeLu } = useNotificationsRegroupees(ouvert);
  const [regroupe, setRegroupe] = useState(false);
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
  const ouvrirEcran = async (notification: NotificationAffichee) => {
    if (!notification.chemin) return;
    await marquerLues([notification.id]);
    onFermer();
    void naviguer(notification.chemin);
  };
  const ouvrirGroupe = async (groupe: GroupeAffiche) => {
    if (!groupe.chemin) return;
    await marquerGroupeLu(groupe);
    onFermer();
    void naviguer(groupe.chemin);
  };

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
              <button type="button" className={styles.fermer} onClick={() => void toutMarquerLu()}>
                {t('coque.toutMarquerLu')}
              </button>
            )}
            <button type="button" ref={boutonFermer} className={styles.fermer} onClick={onFermer}>
              {t('navigation.fermer')}
            </button>
          </div>
        </div>
        <fieldset className={styles.vues} aria-label={t('coque.vue.titre')}>
          {([false, true] as const).map((parHeure) => (
            <button
              type="button"
              key={String(parHeure)}
              className={`${styles.vue} ${regroupe === parHeure ? styles.vueActive : ''}`}
              aria-pressed={regroupe === parHeure}
              onClick={() => setRegroupe(parHeure)}
            >
              {t(parHeure ? 'coque.vue.regroupees' : 'coque.vue.detail')}
            </button>
          ))}
        </fieldset>
        <div className={styles.liste}>
          {regroupe &&
            groupes.map((groupe) => (
              <div
                key={groupe.cle}
                className={styles.carte}
                style={{ borderColor: groupe.nonLues > 0 ? '#F2B705' : 'var(--ob-ligne)' }}
              >
                <span
                  className={styles.pastille}
                  style={{ background: groupe.nonLues > 0 ? '#C2453A' : 'transparent' }}
                />
                <div className={styles.corps}>
                  <div className={styles.ligneType}>
                    <span className={styles.type}>{groupe.type}</span>
                    <span className={styles.heure}>{groupe.heure}</span>
                  </div>
                  <div className={styles.titreCarte}>{groupe.titre}</div>
                  <div className={styles.detail}>
                    {t('coque.vue.compte', { nombre: groupe.nombre, nonLues: groupe.nonLues })}
                  </div>
                  <div className={styles.actionsCarte}>
                    {groupe.chemin && (
                      <button
                        type="button"
                        className={styles.ouvrir}
                        onClick={() => void ouvrirGroupe(groupe)}
                      >
                        {t('coque.ouvrir')}
                      </button>
                    )}
                    {groupe.nonLues > 0 && (
                      <button
                        type="button"
                        className={styles.ouvrir}
                        onClick={() => void marquerGroupeLu(groupe)}
                      >
                        {t('coque.vue.marquerGroupe')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          {regroupe && groupes.length === 0 && (
            <div className={styles.vide}>{t('coque.aucuneNotification')}</div>
          )}
          {!regroupe &&
            notifications.map((notification) => {
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
                        {notification.type}
                      </span>
                      <span className={styles.heure}>{notification.heure}</span>
                    </div>
                    <div className={styles.titreCarte}>{notification.titre}</div>
                    <div className={styles.detail}>{notification.detail}</div>
                    {notification.chemin && (
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
          {!regroupe && notifications.length === 0 && (
            <div className={styles.vide}>{t('coque.aucuneNotification')}</div>
          )}
        </div>
        <div className={styles.regle}>{t('coque.notificationsRegle')}</div>
      </dialog>
    </>
  );
}
