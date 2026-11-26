import { useTranslation } from '@/i18n';

import type { BrouillonMouvement } from './brouillonMouvement.ts';
import { PRODUITS } from './calculs.ts';
import styles from './Mouvements.module.css';
import { TotauxPains } from './TotauxPains.tsx';
import { TYPES_MOUVEMENT, type InstantaneSession } from './types.ts';

type Props = {
  instantane: InstantaneSession;
  brouillon: BrouillonMouvement;
  onChange: (brouillon: BrouillonMouvement) => void;
  onAjouter: () => void;
  /** Le formulaire n'existe que pour qui peut saisir (caissier ou gérant, session ouverte). */
  peutSaisir: boolean;
};

/** Onglet « Mouvements internes » : ventes au guichet, retours, restes en salle, rations. */
export function Mouvements({ instantane, brouillon, onChange, onAjouter, peutSaisir }: Props) {
  const { t } = useTranslation();
  const { mouvements } = instantane;
  const modifier = (changement: Partial<BrouillonMouvement>) =>
    onChange({ ...brouillon, erreur: '', ...changement });

  return (
    <div className={styles.page}>
      {peutSaisir && (
        <form
          className={styles.formulaire}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onAjouter();
          }}
        >
          <div className={styles.titre}>{t('comptoir.session.mouvements.nouveau')}</div>
          <div className={styles.groupe}>
            <span className={styles.libelle}>{t('comptoir.session.mouvements.type')}</span>
            <div className={styles.puces}>
              {TYPES_MOUVEMENT.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={`${styles.puceType} ${brouillon.type === type ? styles.puceChoisie : ''}`}
                  aria-pressed={brouillon.type === type}
                  onClick={() => modifier({ type })}
                >
                  {t(`comptoir.session.mouvements.types.${type}`)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.groupe}>
            <span className={styles.libelle}>{t('comptoir.session.mouvements.produit')}</span>
            <div className={styles.puces}>
              {PRODUITS.map((produit) => (
                <button
                  type="button"
                  key={produit.cle}
                  className={`${styles.puceType} ${styles.puceProduit} ${brouillon.produit === produit.cle ? styles.puceChoisie : ''}`}
                  aria-pressed={brouillon.produit === produit.cle}
                  onClick={() => modifier({ produit: produit.cle })}
                >
                  {produit.libelle}
                </button>
              ))}
            </div>
          </div>
          <label className={styles.etiquette}>
            {t('comptoir.session.mouvements.quantite')}
            <input
              className={styles.quantite}
              value={brouillon.quantite}
              onChange={(e) => modifier({ quantite: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              placeholder="0"
            />
          </label>
          <label className={styles.etiquette}>
            {t('comptoir.session.mouvements.motif')}
            <input
              className={`${styles.motif} ${brouillon.erreur ? styles.motifErreur : ''}`}
              value={brouillon.motif}
              onChange={(e) => modifier({ motif: e.target.value })}
              aria-invalid={brouillon.erreur !== ''}
            />
            <span className={styles.erreur} role={brouillon.erreur ? 'alert' : undefined}>
              {brouillon.erreur ? t(`comptoir.session.mouvements.${brouillon.erreur}`) : ''}
            </span>
          </label>
          <button type="submit" className={styles.ajouter}>
            {t('comptoir.session.mouvements.ajouter')}
          </button>
        </form>
      )}
      <div className={styles.colonneListe}>
        {instantane.session.caisseId && (
          <TotauxPains
            caisse={instantane.session.caisseId}
            signature={`${mouvements.length}-${instantane.livraisons.length}`}
          />
        )}
        <section className={styles.liste} aria-labelledby="titre-mouvements">
          <div className={styles.listeTitre} id="titre-mouvements">
            {t('comptoir.session.mouvements.titre')}
          </div>
          {mouvements.map((mouvement) => (
            <div className={styles.mouvement} key={mouvement.id}>
              <div className={styles.mouvementTitre}>
                {t('comptoir.session.mouvements.ligne', {
                  type: t(`comptoir.session.mouvements.types.${mouvement.type}`),
                  quantite: mouvement.quantite,
                  produit: PRODUITS.find((p) => p.cle === mouvement.produit)?.libelle,
                })}
              </div>
              <div className={styles.mouvementMeta}>
                {`${mouvement.motif} · ${mouvement.par} · ${mouvement.heure}`}
              </div>
            </div>
          ))}
          {mouvements.length === 0 && (
            <div className={styles.vide}>{t('comptoir.session.mouvements.vide')}</div>
          )}
        </section>
      </div>
    </div>
  );
}
