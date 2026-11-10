/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Tableau en grille CSS (colonnes de la maquette) : passer à <table> changerait la mise en page au pixel près ; les rôles ARIA table, row et cell portent la sémantique. */
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useId } from 'react';
import { Link } from 'react-router';

import styles from './Parametres.module.css';
import type { ProduitParametre } from './types.ts';

const prixObserves = (prix: ProduitParametre['prix']): string =>
  prix ? (prix[0] === prix[1] ? String(prix[0]) : `${prix[0]} / ${prix[1]}`) : '—';

/**
 * « Produits et fiches techniques » : une ligne par produit, qui ouvre sa fiche technique. Sans
 * chemin de fiche (profil qui n'a pas la production), la ligne se lit sans s'ouvrir.
 */
export function Produits({
  produits,
  cheminFiche,
}: {
  produits: ProduitParametre[];
  /** Adresse de la fiche d'un produit ; absent : la ligne n'ouvre rien. */
  cheminFiche?: (id: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const titre = useId();
  const tp = (cle: string) => t(`gestion.parametres.produits.${cle}`);
  return (
    <section className={styles.tableau} aria-labelledby={titre}>
      <div className={styles.tableauInterne}>
        <h2 id={titre} className={`${styles.titre} ${styles.tableauTitre}`}>
          {tp('titre')}
        </h2>
        <div role="table" aria-labelledby={titre}>
          <div role="row" className={`${styles.rangeeProduits} ${styles.enteteProduits}`}>
            <span role="columnheader">{tp('produit')}</span>
            <span role="columnheader" className={styles.droite}>
              {tp('boule')}
            </span>
            <span role="columnheader" className={styles.droite}>
              {tp('painsBoule')}
            </span>
            <span role="columnheader" className={styles.droite}>
              {tp('painsSac')}
            </span>
            <span role="columnheader" className={styles.droite}>
              {tp('prix')}
            </span>
            <span role="columnheader" aria-hidden="true" />
          </div>
          {produits.map((p) => {
            const nom = `${p.code} – ${i18n.language === 'en' ? p.nomEn : p.nom}`;
            return (
              <div
                key={p.id}
                role="row"
                className={`${styles.rangeeProduits} ${styles.ligneProduit} ${cheminFiche ? styles.ligneProduitOuvrable : ''}`}
              >
                <span role="cell">
                  {cheminFiche ? (
                    <Link className={styles.nomProduit} to={cheminFiche(p.id)}>
                      {nom}
                    </Link>
                  ) : (
                    <span className={styles.nomProduit}>{nom}</span>
                  )}
                </span>
                <span role="cell" className={styles.droite}>
                  {formaterNombre(p.boule)}
                </span>
                <span role="cell" className={styles.droite}>
                  {p.pb}
                </span>
                <span role="cell" className={styles.droite}>
                  {p.painsParSac}
                </span>
                <span role="cell" className={styles.droite}>
                  {prixObserves(p.prix)}
                </span>
                <span role="cell" className={styles.ouvrir} aria-hidden="true">
                  {cheminFiche ? tp('fiche') : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
