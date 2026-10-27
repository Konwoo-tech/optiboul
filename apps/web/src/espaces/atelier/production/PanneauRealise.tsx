import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { ecartEnPains, libelleProduit } from './affichage.ts';
import styles from './Production.module.css';
import { chiffresSaisis, lireSaisie, motDEcart, pourcentDEcart } from './regles.ts';
import { CLES_PRODUIT, type Brouillon, type CleProduit, type Plan } from './types.ts';

type Props = {
  plan: Plan;
  valeurs: Brouillon<CleProduit>;
  /** Pourquoi la saisie est fermée ; `null` : le responsable saisit. */
  lectureSeule: 'proprietaire' | 'responsable' | 'ouverture' | 'cloturee' | null;
  occupe: boolean;
  onChange: (produit: CleProduit, texte: string) => void;
  onEnregistrer: () => void;
};

/** Onglet « Réalisé » : les pains réellement produits, avec l'écart en pains et en pourcentage. */
export function PanneauRealise({
  plan,
  valeurs,
  lectureSeule,
  occupe,
  onChange,
  onEnregistrer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const tr = (cle: string) => t(`atelier.production.realise.${cle}`);

  return (
    <section className={`${styles.carte} ${styles.carteSaisie}`} aria-labelledby="titre-realise">
      <div>
        <h2 className={styles.titre} id="titre-realise">
          {tr('titre')}
        </h2>
        <div className={styles.sousTitre}>{tr('sous')}</div>
      </div>
      {CLES_PRODUIT.map((cle) => {
        const prevu = plan.lignes[cle].prevus;
        const saisi = lireSaisie(valeurs[cle]);
        const ecart = (saisi ?? 0) - prevu;
        const pourcent = pourcentDEcart(ecart, prevu);
        const mot = motDEcart(pourcent);
        return (
          <div className={styles.ligneSaisie} key={cle}>
            <div className={styles.produitSaisie}>{libelleProduit(cle)}</div>
            <div className={styles.colonnePrevu}>
              <div className={styles.petitLibelle}>{tr('prevu')}</div>
              <div className={styles.prevuValeur}>{formaterNombre(prevu)}</div>
            </div>
            <input
              id={`realise-${cle}`}
              className={styles.champGrand}
              value={valeurs[cle]}
              onChange={(e) => onChange(cle, chiffresSaisis(e.target.value))}
              disabled={lectureSeule !== null}
              inputMode="numeric"
              placeholder={tr('realise')}
              aria-label={t('atelier.production.realise.champ', { produit: libelleProduit(cle) })}
            />
            <div className={styles.ecartGrand}>
              {saisi === null ? '—' : ecartEnPains(ecart, pourcent, langue)}
            </div>
            {saisi !== null && (
              <span
                className={styles.mot}
                style={{ background: `var(--ob-${mot}-fond)`, color: `var(--ob-${mot}-texte)` }}
              >
                {t(`atelier.production.mots.${mot}`)}
              </span>
            )}
          </div>
        );
      })}
      {lectureSeule && <p className={styles.lectureSeule}>{tr(`lecture.${lectureSeule}`)}</p>}
      {lectureSeule === null && (
        <button
          type="button"
          className={styles.enregistrer}
          disabled={occupe}
          onClick={onEnregistrer}
        >
          {tr('enregistrer')}
        </button>
      )}
    </section>
  );
}
