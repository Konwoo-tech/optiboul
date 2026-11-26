import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { formaterNombre } from '@/utils';

import { jourCourt } from './affichage.ts';
import { ouvrirLeRecu, usePaiementsFacture } from './api.ts';
import styles from './Fournisseurs.module.css';
import type { Facture } from './types.ts';

type Props = { facture: Facture; onFermer: () => void };

/** Tous les paiements d'une facture, du plus récent au plus ancien, chacun avec son reçu PDF. */
export function ModaleHistorique({ facture, onFermer }: Props) {
  const { t, i18n } = useTranslation();
  const paiements = usePaiementsFacture(facture.idServeur);
  const lignes = paiements.data ?? [];

  return (
    <FenetreModale
      titre={t('gestion.fournisseurs.historique.titre', { numero: facture.numero })}
      onFermer={onFermer}
    >
      {paiements.isPending && (
        <p className={styles.sous}>{t('gestion.fournisseurs.historique.chargement')}</p>
      )}
      {paiements.isError && (
        <p className={styles.erreurModale} role="alert">
          {t('gestion.fournisseurs.historique.erreur')}
        </p>
      )}
      {paiements.isSuccess && lignes.length === 0 && (
        <p className={styles.sous}>{t('gestion.fournisseurs.historique.vide')}</p>
      )}
      {lignes.length > 0 && (
        <ul className={styles.lignes} aria-label={t('gestion.fournisseurs.historique.liste')}>
          {lignes.map((p) => (
            <li className={styles.ligne} key={p.id}>
              <div className={styles.texteFacture}>
                <div className={styles.titre}>
                  {jourCourt(p.jour, i18n.language)}
                  {' · '}
                  {t(`gestion.fournisseurs.modes.${p.mode}`)}
                </div>
                <div className={styles.sous}>
                  {p.payePar}
                  {p.reference
                    ? t('gestion.fournisseurs.factures.reference', { reference: p.reference })
                    : ''}
                </div>
              </div>
              <span className={styles.montant}>
                {formaterNombre(p.montant)}
                {' FCFA'}
              </span>
              <button
                type="button"
                className={styles.secondaire}
                aria-label={`${t('gestion.fournisseurs.factures.recu')} ${p.id}`}
                onClick={() => ouvrirLeRecu(p.id)}
              >
                {t('gestion.fournisseurs.factures.recu')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.fournisseurs.historique.fermer')}
        </button>
      </div>
    </FenetreModale>
  );
}
