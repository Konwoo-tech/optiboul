import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, afficherRefus, useToast } from '@/ui';
import { formaterNombre } from '@/utils';
import { useState } from 'react';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import {
  STATUTS_ENVOI,
  useEnvois,
  useRelancerEnvoi,
  type FiltreEnvoi,
  type StatutEnvoi,
} from './api.ts';
import styles from './Envois.module.css';

const NIVEAU: Record<StatutEnvoi, 'ok' | 'surveiller' | 'bloquant'> = {
  envoye: 'ok',
  en_attente: 'surveiller',
  echec: 'bloquant',
};

/**
 * Gestion › Envois : la file des messages sortants (SMS, WhatsApp, e-mail) avec leur état. Un
 * message en échec se relance d'un clic ; le serveur le renvoie au prochain passage (O15).
 */
export default function EcranEnvois({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const [filtre, setFiltre] = useState<FiltreEnvoi>('tous');
  const requete = useEnvois(nom, filtre);
  const relancer = useRelancerEnvoi(nom);

  const donnees = requete.data;
  if (!donnees) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.envois.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const { etat, messages, total } = donnees;
  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Douala',
    }).format(new Date(iso));

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <div className={styles.etat}>
          {[
            [t('gestion.envois.internet'), t(`gestion.envois.internetValeurs.${etat.internet}`)],
            [t('gestion.envois.enAttente'), formaterNombre(etat.en_attente)],
            [t('gestion.envois.enEchec'), formaterNombre(etat.en_echec)],
          ].map(([libelle, valeur]) => (
            <div className={styles.chiffre} key={libelle}>
              <div className={styles.chiffreLibelle}>{libelle}</div>
              <div className={styles.chiffreValeur}>{valeur}</div>
            </div>
          ))}
        </div>

        <fieldset className={styles.filtres} aria-label={t('gestion.envois.filtres')}>
          {(['tous', ...STATUTS_ENVOI] as const).map((cle) => (
            <button
              type="button"
              key={cle}
              className={styles.puce}
              aria-pressed={filtre === cle}
              onClick={() => setFiltre(cle)}
            >
              {t(`gestion.envois.statuts.${cle}`)}
            </button>
          ))}
        </fieldset>

        <ul className={styles.liste} aria-label={t('gestion.envois.liste', { count: total })}>
          {messages.map((m) => {
            const niveau = NIVEAU[m.statut];
            return (
              <li className={styles.ligne} key={m.id}>
                <div className={styles.texte}>
                  <span className={styles.titre}>
                    {t(`gestion.envois.canaux.${m.canal}`)} · {m.destinataire}
                  </span>
                  {m.sujet && <span className={styles.sous}>{m.sujet}</span>}
                  <span className={styles.sous}>
                    {t('gestion.envois.creeLe', { date: quand(m.cree_le) })}
                    {m.tentatives
                      ? ` · ${t('gestion.envois.tentatives', { count: m.tentatives })}`
                      : ''}
                  </span>
                  {m.derniere_erreur && <span className={styles.erreur}>{m.derniere_erreur}</span>}
                </div>
                <div className={styles.droite}>
                  <span
                    className={styles.statut}
                    style={{
                      background: `var(--ob-${niveau}-fond)`,
                      color: `var(--ob-${niveau}-texte)`,
                    }}
                  >
                    {t(`gestion.envois.statuts.${m.statut}`)}
                  </span>
                  {m.statut === 'echec' && (
                    <button
                      type="button"
                      className={styles.relancer}
                      disabled={relancer.isPending}
                      aria-label={t('gestion.envois.relancerNom', { destinataire: m.destinataire })}
                      onClick={() =>
                        relancer.mutate(m.id, {
                          onSuccess: () => afficher(t('gestion.envois.toastRelance')),
                          onError: (erreur) =>
                            afficherRefus(afficher, t, erreur, 'gestion.envois.toastErreur'),
                        })
                      }
                    >
                      {t('gestion.envois.relancer')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {messages.length === 0 && <li className={styles.vide}>{t('gestion.envois.vide')}</li>}
        </ul>
      </div>
    </>
  );
}
