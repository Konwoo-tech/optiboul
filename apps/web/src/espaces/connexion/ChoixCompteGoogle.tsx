import { useTranslation } from '@/i18n';
import { useUtilisateursSimules } from '@/simulation';
import { AvatarUtilisateur, LogoGoogle } from '@/ui';

import styles from './Etapes.module.css';

type Props = {
  onChoisir: (email: string) => void;
  onAnnuler: () => void;
};

/** Sélecteur de compte Google simulé (maquette, lignes 87-96). */
export function ChoixCompteGoogle({ onChoisir, onAnnuler }: Props) {
  const { t } = useTranslation();
  const { data: comptes } = useUtilisateursSimules();

  return (
    <div className={styles.google}>
      <div className={styles.googleEntete}>
        <LogoGoogle taille={32} />
        <div className={styles.googleTitre}>{t('connexion.googleTitre')}</div>
        <div className={styles.googleSous}>{t('connexion.googleSous')}</div>
      </div>
      <div className={styles.googleComptes}>
        {comptes?.map((compte) => (
          <button
            key={compte.id}
            type="button"
            className={styles.googleCompte}
            onClick={() => onChoisir(compte.email)}
          >
            <AvatarUtilisateur nom={compte.nom} profil={compte.profil} taille={36} />
            <span className={styles.googleTextes}>
              <span className={styles.googleNom}>{compte.nom}</span>
              <span className={styles.googleEmail}>{compte.email}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.googleNote}>{t('connexion.googleNote')}</div>
      <button type="button" className={styles.googleAnnuler} onClick={onAnnuler}>
        {t('connexion.annulerGoogle')}
      </button>
    </div>
  );
}
