import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { SIMULATION } from '@/simulation';
import { useId } from 'react';

import styles from './Sauvegardes.module.css';

type Props = {
  /** Date de la copie à restaurer, déjà mise en forme (« 14 oct. 13:30 »). */
  date: string;
  enCours: boolean;
  /** Message d'un refus du serveur, affiché dans la fenêtre. */
  erreur: string | null;
  onFermer: () => void;
  onConfirmer: () => void;
};

/**
 * Restauration guidée (maquette : `modal.restore`) : trois étapes annoncées avant de confirmer.
 * Pendant l'envoi, ni la confirmation ni l'annulation ne sont actives : une seule restauration
 * à la fois.
 */
export function ModaleRestauration({ date, enCours, erreur, onFermer, onConfirmer }: Props) {
  const { t } = useTranslation();
  const idErreur = useId();
  const etapes = [
    t('gestion.sauvegardes.restauration.etape1'),
    t('gestion.sauvegardes.restauration.etape2', { date }),
    t('gestion.sauvegardes.restauration.etape3'),
  ];

  return (
    <FenetreModale
      titre={t('gestion.sauvegardes.restauration.titre')}
      onFermer={() => {
        if (!enCours) onFermer();
      }}
    >
      <ol className={styles.etapes}>
        {etapes.map((texte, rang) => (
          <li className={styles.etape} key={rang}>
            <span className={styles.numero} aria-hidden>
              {rang + 1}
            </span>
            <span className={styles.texteEtape}>{texte}</span>
          </li>
        ))}
      </ol>
      {/* Mention de simulation : masquée au banc visuel (`[data-simulation]`), absente du prototype. */}
      {SIMULATION && (
        <span className={styles.simule} data-simulation>
          {t('gestion.sauvegardes.restauration.simule')}
        </span>
      )}
      {erreur && (
        <span className={styles.erreurModale} id={idErreur} role="alert">
          {erreur}
        </span>
      )}
      <div className={styles.boutons}>
        <button
          type="button"
          className={styles.annuler}
          aria-disabled={enCours}
          onClick={() => {
            if (!enCours) onFermer();
          }}
        >
          {t('gestion.sauvegardes.restauration.annuler')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          aria-disabled={enCours}
          aria-describedby={erreur ? idErreur : undefined}
          onClick={() => {
            if (!enCours) onConfirmer();
          }}
        >
          {t('gestion.sauvegardes.restauration.confirmer')}
        </button>
      </div>
    </FenetreModale>
  );
}
