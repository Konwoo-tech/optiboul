import { useNetwork } from '@mantine/hooks';
import { useTranslation } from '@/i18n';
import { useContexte } from '@/coque/contexte.ts';
import { BasculeApparence, useCreneau, useHorloge } from '@/ui';
import { formaterDateLongue, formaterHeure } from '@/utils';

import styles from './Connexion.module.css';

/** Colonne de gauche : heure, session en cours, gérant de la semaine, poste et réseau. */
export function ColonneSession() {
  const { t, i18n } = useTranslation();
  const maintenant = useHorloge();
  const creneau = useCreneau();
  const { online } = useNetwork();
  const { data: contexte } = useContexte();

  const type = t(creneau === 'nuit' ? 'creneau.nuitCourt' : 'creneau.jourCourt');

  return (
    <div className={styles.gauche}>
      <div className={styles.entete}>
        <div className={styles.marque}>
          <span className={styles.nom}>OptiBoul</span>
          <span className={styles.etiquette}>ERP</span>
        </div>
        <BasculeApparence sur="barre" />
      </div>

      <div className={styles.horodatage}>
        <div className={styles.date}>{formaterDateLongue(maintenant, i18n.language)}</div>
        <div className={styles.horloge}>{formaterHeure(maintenant)}</div>
        <div className={styles.lignes}>
          <div className={styles.ligne}>
            <span className={styles.libelle}>{t('connexion.session')}</span>
            <span className={`${styles.valeur} ${styles.session}`}>
              <span className={styles.point} style={{ background: '#7CD39A' }} />
              {contexte
                ? t('connexion.sessionOuverte', { type, heure: contexte.sessionOuverteDepuis })
                : type}
            </span>
          </div>
          {contexte && (
            <>
              <div className={styles.ligne}>
                <span className={styles.libelle}>{t('connexion.gerantSemaine')}</span>
                <span className={styles.valeur}>
                  {t('connexion.gerantSemaineValeur', {
                    nom: contexte.gerantDeLaSemaine,
                    numero: contexte.semaine.numero,
                  })}
                </span>
              </div>
              <div className={styles.ligne}>
                <span className={styles.libelle}>{t('connexion.poste')}</span>
                <span className={styles.valeur}>
                  {contexte.poste} · {t(online ? 'etat.enLigneCourt' : 'etat.horsLigneCourt')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.pied}>Boulangerie du Faubourg · Etoudi, Yaoundé</div>
    </div>
  );
}
