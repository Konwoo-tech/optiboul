import { reglesNotificationList, reglesNotificationUpdate, type Regle } from '@/api';
import { useTranslation } from '@/i18n';
import { useToast } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

import styles from './Parametres.module.css';

const CLE = ['gestion', 'regles-notification'] as const;

/** Profils qui peuvent recevoir une notification (ordre de l'écran Utilisateurs). */
const PROFILS = ['proprietaire', 'gerant', 'production', 'caissier', 'administrateur'] as const;
/** « application » est toujours active : le serveur la garde. Les autres canaux se choisissent. */
const CANAUX = ['sms', 'whatsapp'] as const;

/**
 * Règles de notification (US-140) : pour chaque événement, qui est prévenu et par quels canaux
 * (l'application est toujours active). Réservé à qui peut régler les notifications ; les autres lisent.
 */
export function ReglesNotification({ lecture }: { lecture: boolean }) {
  const { t } = useTranslation();
  const afficher = useToast();
  const client = useQueryClient();
  const titre = useId();
  const regles = useQuery({
    queryKey: CLE,
    queryFn: async () => (await reglesNotificationList()).data as unknown as Regle[],
  });
  const modifier = useMutation({
    mutationFn: async (regle: Regle) =>
      (
        await reglesNotificationUpdate(regle.genre, {
          profils: regle.profils,
          canaux: regle.canaux,
        } as never)
      ).data as unknown as Regle,
    onSuccess: (regle) => {
      client.setQueryData<Regle[]>(CLE, (liste) =>
        liste?.map((r) => (r.genre === regle.genre ? regle : r)),
      );
      afficher(t('gestion.parametres.notifications.enregistre', { libelle: regle.libelle }));
    },
    onError: () => {
      afficher(t('gestion.parametres.notifications.erreur'));
      void regles.refetch();
    },
  });

  const basculer = <T extends string>(liste: readonly T[], valeur: T): T[] =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];

  if (regles.isError) return null;
  if (!regles.data) return null;

  return (
    <section className={styles.carte} aria-labelledby={titre}>
      <h2 id={titre} className={styles.titre}>
        {t('gestion.parametres.notifications.titre')}
      </h2>
      <p className={styles.note}>{t('gestion.parametres.notifications.aide')}</p>
      <ul className={styles.liste}>
        {regles.data.map((regle) => (
          <li key={regle.genre} className={styles.parametre}>
            <div className={styles.parametreNom}>{regle.libelle}</div>
            <div className={styles.controle}>
              <fieldset
                className={styles.jours}
                aria-label={t('gestion.parametres.notifications.profils', {
                  libelle: regle.libelle,
                })}
              >
                {PROFILS.map((profil) => (
                  <label key={profil} className={styles.jour}>
                    <input
                      type="checkbox"
                      checked={regle.profils.includes(profil)}
                      disabled={lecture || modifier.isPending}
                      onChange={() =>
                        modifier.mutate({ ...regle, profils: basculer(regle.profils, profil) })
                      }
                    />
                    {t(`profils.${profil}`)}
                  </label>
                ))}
              </fieldset>
              <fieldset
                className={styles.jours}
                aria-label={t('gestion.parametres.notifications.canaux', {
                  libelle: regle.libelle,
                })}
              >
                {CANAUX.map((canal) => (
                  <label key={canal} className={styles.jour}>
                    <input
                      type="checkbox"
                      checked={regle.canaux.includes(canal)}
                      disabled={lecture || modifier.isPending}
                      onChange={() =>
                        modifier.mutate({ ...regle, canaux: basculer(regle.canaux, canal) })
                      }
                    />
                    {t(`gestion.parametres.notifications.canal.${canal}`)}
                  </label>
                ))}
              </fieldset>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
