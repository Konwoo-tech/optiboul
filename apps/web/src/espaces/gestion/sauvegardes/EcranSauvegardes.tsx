import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { SIMULATION } from '@/simulation';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { formaterHeure } from '@/utils';
import { useNetwork } from '@mantine/hooks';
import { useRef, useState } from 'react';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import {
  codeErreur,
  useRestaurer,
  useSauvegarderCloud,
  useSauvegarderLocale,
  useSauvegardes,
} from './api.ts';
import { ModaleRestauration } from './ModaleRestauration.tsx';
import { libelleDeCopie } from './regles.ts';
import styles from './Sauvegardes.module.css';
import type { Copie } from './types.ts';

/** Code d'erreur du serveur → clé du message affiché. */
const MESSAGES_D_ERREUR: Record<string, string> = {
  droit_insuffisant: 'droit',
  copie_inconnue: 'inconnue',
  restauration_en_cours: 'restaurationEnCours',
  restauration_impossible: 'impossible',
  restauration_session_perdue: 'sessionPerdue',
  sauvegarde_echec: 'echec',
};

/**
 * Gestion › Sauvegardes (US-142, US-143) : l'état des copies locale et cloud, la sauvegarde à la
 * demande, la liste des copies et la restauration guidée. Réservé à l'administrateur. Hors ligne,
 * la copie cloud n'est pas lancée : l'écran le dit (le reste fonctionne).
 *
 * Le contrôle des totaux annoncé à la restauration est fictif en simulation (voir le faux serveur).
 */
export default function EcranSauvegardes({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { online } = useNetwork();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const requete = useSauvegardes(nom);
  const locale = useSauvegarderLocale(nom);
  const cloud = useSauvegarderCloud(nom);
  const restaurer = useRestaurer(nom);
  const [aRestaurer, setARestaurer] = useState<Copie | null>(null);
  const [erreurModale, setErreurModale] = useState<string | null>(null);
  // Garde synchrone : deux clics avant le rendu suivant ne lancent qu'une seule action.
  const enCours = useRef(false);

  const instantane = requete.data;

  if (!instantane || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.sauvegardes.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const { copies, derniereLocale, derniereCloud, cloudEnRetard, derniereEchec } = instantane;
  const occupe = [locale, cloud, restaurer].some((m) => m.isPending);
  const date = (instant: string | null) =>
    instant ? libelleDeCopie(instant, i18n.language) : t('gestion.sauvegardes.aucune');

  const exclusif = (action: (fin: () => void) => void) => {
    if (occupe || enCours.current) return;
    enCours.current = true;
    action(() => {
      enCours.current = false;
    });
  };

  const messageDErreur = (erreur: unknown) => {
    const code = codeErreur(erreur);
    const cle = code ? MESSAGES_D_ERREUR[code] : undefined;
    return t(`gestion.sauvegardes.toasts.${cle ?? 'erreur'}`, {
      // Le serveur dit pourquoi une restauration est impossible (outil absent, copie illisible…).
      detail: erreur instanceof Error ? erreur.message : '',
    });
  };

  const surLocale = () =>
    exclusif((fin) =>
      locale.mutate(undefined, {
        onSettled: fin,
        onSuccess: ({ copie }) =>
          afficher(
            copie.id === 'en-attente'
              ? t('gestion.sauvegardes.toasts.enAttente')
              : t('gestion.sauvegardes.toasts.locale', {
                  heure: formaterHeure(new Date(copie.instant)),
                }),
          ),
        onError: (erreur) => {
          afficher(messageDErreur(erreur));
          void requete.refetch();
        },
      }),
    );

  const surCloud = () => {
    // Hors ligne, rien ne part : la copie attend le retour du réseau (file d'envoi, US-141).
    if (!online) {
      afficher(t('gestion.sauvegardes.toasts.cloudEnAttente'));
      return;
    }
    exclusif((fin) =>
      cloud.mutate(undefined, {
        onSettled: fin,
        onSuccess: ({ copie }) =>
          afficher(
            t(
              copie.id === 'en-attente'
                ? 'gestion.sauvegardes.toasts.enAttente'
                : 'gestion.sauvegardes.toasts.cloud',
            ),
          ),
        onError: (erreur) => {
          afficher(messageDErreur(erreur));
          void requete.refetch();
        },
      }),
    );
  };

  const fermerLaModale = () => {
    setARestaurer(null);
    setErreurModale(null);
  };

  const surRestauration = () => {
    const copie = aRestaurer;
    if (!copie) return;
    exclusif((fin) =>
      restaurer.mutate(copie.id, {
        onSettled: fin,
        onSuccess: ({ restauration }) => {
          fermerLaModale();
          const ecarts = restauration.controles.filter((c) => !c.ok);
          afficher(
            ecarts.length > 0
              ? t('gestion.sauvegardes.toasts.restaureeAvecEcart', {
                  controles: ecarts
                    .map((c) => t(`gestion.sauvegardes.restauration.controles.${c.cle}`))
                    .join(', '),
                })
              : t(
                  SIMULATION
                    ? 'gestion.sauvegardes.toasts.restauree'
                    : 'gestion.sauvegardes.toasts.restaureeVerifiee',
                ),
          );
        },
        onError: (erreur) => {
          if (codeErreur(erreur) === 'copie_inconnue') {
            fermerLaModale();
            afficher(messageDErreur(erreur));
          } else {
            setErreurModale(messageDErreur(erreur));
          }
          void requete.refetch();
        },
      }),
    );
  };

  const niveau = cloudEnRetard ? 'bloquant' : 'ok';

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        {derniereEchec && (
          <div className={styles.alerte} role="alert">
            {t('gestion.sauvegardes.alerteEchec', {
              genre: t(`gestion.sauvegardes.copies.${derniereEchec.genre}`).toLowerCase(),
              date: date(derniereEchec.instant),
              erreur: derniereEchec.erreur,
            })}
          </div>
        )}
        {cloudEnRetard && (
          <div className={styles.alerte} role="alert">
            {derniereCloud
              ? t('gestion.sauvegardes.alerte', { date: date(derniereCloud) })
              : t('gestion.sauvegardes.alerteJamais')}
          </div>
        )}
        <div className={styles.cartes}>
          <div className={styles.carte}>
            <div className={styles.titreCarte}>{t('gestion.sauvegardes.locale.titre')}</div>
            <div className={styles.valeur}>{date(derniereLocale)}</div>
            <div className={styles.sous}>{t('gestion.sauvegardes.locale.sous')}</div>
            <button
              type="button"
              className={styles.secondaire}
              aria-disabled={occupe}
              onClick={surLocale}
            >
              {t('gestion.sauvegardes.locale.lancer')}
            </button>
          </div>
          <div className={styles.carte}>
            <div className={styles.enteteCarte}>
              <span className={styles.titreCarte}>{t('gestion.sauvegardes.cloud.titre')}</span>
              <span
                className={styles.mot}
                style={{
                  background: `var(--ob-${niveau}-fond)`,
                  color: `var(--ob-${niveau}-texte)`,
                }}
              >
                {t(
                  cloudEnRetard
                    ? 'gestion.sauvegardes.cloud.enRetard'
                    : 'gestion.sauvegardes.cloud.aJour',
                )}
              </span>
            </div>
            <div className={styles.valeur}>{date(derniereCloud)}</div>
            <div className={styles.sous}>
              {t(
                online
                  ? 'gestion.sauvegardes.cloud.connexion'
                  : 'gestion.sauvegardes.cloud.horsLigne',
              )}
            </div>
            <button
              type="button"
              className={styles.principal}
              aria-disabled={occupe}
              onClick={surCloud}
            >
              {t('gestion.sauvegardes.cloud.lancer')}
            </button>
          </div>
        </div>
        <section className={styles.liste} aria-labelledby="titre-copies">
          <h2 className={styles.titreListe} id="titre-copies">
            {t('gestion.sauvegardes.copies.titre')}
          </h2>
          <ul className={styles.copies}>
            {copies.map((copie) => (
              <li className={styles.copie} key={copie.id}>
                <span className={styles.date}>{date(copie.instant)}</span>
                <span className={styles.genre}>
                  {t(
                    copie.genre === 'cloud'
                      ? 'gestion.sauvegardes.copies.cloud'
                      : 'gestion.sauvegardes.copies.locale',
                  )}
                </span>
                <button
                  type="button"
                  className={styles.restaurer}
                  aria-label={t('gestion.sauvegardes.copies.restaurerCopie', {
                    date: date(copie.instant),
                  })}
                  onClick={() => {
                    if (!occupe) setARestaurer(copie);
                  }}
                >
                  {t('gestion.sauvegardes.copies.restaurer')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {aRestaurer && (
        <ModaleRestauration
          date={date(aRestaurer.instant)}
          enCours={restaurer.isPending}
          erreur={erreurModale}
          onFermer={fermerLaModale}
          onConfirmer={surRestauration}
        />
      )}
    </>
  );
}
