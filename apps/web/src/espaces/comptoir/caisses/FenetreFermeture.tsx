import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { formaterNombre, formaterNombreSigne } from '@/utils';
import { useState, type SubmitEvent } from 'react';

import { ecartDeCaisse, nombreSaisi, statutEcart } from './regles.ts';
import type { DetailEspeces } from './types.ts';
import styles from './Fenetres.module.css';

type Props = {
  detail: DetailEspeces;
  erreur: string | null;
  envoiEnCours: boolean;
  onConfirmer: (compte: number) => void;
  onFermer: () => void;
};

const NIVEAUX = {
  juste: styles.ecartOk,
  manque: styles.ecartBloquant,
  excedent: styles.ecartSurveiller,
} as const;

/** « Fermer la caisse » : un seul comptage des espèces, l'écart est connu tout de suite (US-042). */
export function FenetreFermeture({ detail, erreur, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [compte, setCompte] = useState('');
  const saisi = compte !== '';
  const ecart = ecartDeCaisse(detail.attendu, nombreSaisi(compte));
  const statut = statutEcart(ecart);

  const mot = !saisi
    ? t('comptoir.caisses.fermeture.saisir')
    : statut === 'juste'
      ? t('comptoir.caisses.fermeture.juste')
      : t(`comptoir.caisses.fermeture.${statut}`, { montant: formaterNombre(Math.abs(ecart)) });

  const lignes: [string, string][] = [
    [t('comptoir.caisses.fermeture.fonds'), formaterNombre(detail.fonds)],
    [t('comptoir.caisses.fermeture.especes'), formaterNombre(detail.especes)],
    [t('comptoir.caisses.fermeture.depenses'), formaterNombre(-detail.depenses)],
    [t('comptoir.caisses.fermeture.remises'), formaterNombre(-detail.remises)],
  ];

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (saisi) onConfirmer(nombreSaisi(compte));
  };

  return (
    <FenetreModale titre={t('comptoir.caisses.fermeture.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.lignes}>
          {lignes.map(([libelle, valeur]) => (
            <div key={libelle} className={styles.recap}>
              <span>{libelle}</span>
              <span className={styles.recapValeur}>{valeur}</span>
            </div>
          ))}
        </div>
        <div>
          <div className={styles.attendu}>{t('comptoir.caisses.fermeture.attendu')}</div>
          <div className={styles.attenduValeur}>{`${formaterNombre(detail.attendu)} FCFA`}</div>
        </div>
        <label className={styles.champ}>
          {t('comptoir.caisses.fermeture.compte')}
          <input
            className={styles.compte}
            value={compte}
            onChange={(e) => setCompte(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="0"
          />
        </label>
        <div
          className={`${styles.ecartBloc} ${saisi ? NIVEAUX[statut] : styles.ecartNeutre}`}
          aria-live="polite"
        >
          <div>
            <div className={styles.ecartTitre}>{t('comptoir.caisses.fermeture.ecart')}</div>
            <div className={styles.ecartMot}>{mot}</div>
          </div>
          <div className={styles.ecartValeur}>
            {saisi ? `${formaterNombreSigne(ecart)} FCFA` : '—'}
          </div>
        </div>
        <div className={styles.discret}>{t('comptoir.caisses.fermeture.note')}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {erreur}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.caisses.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={!saisi || envoiEnCours}>
            {t('comptoir.caisses.fermeture.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
