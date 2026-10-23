import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useState } from 'react';

import {
  codeInventaire,
  dateCourte,
  jourCourt,
  nomMatiere,
  quantite,
  uniteMatiere,
} from './affichage.ts';
import { joursDuSelecteur, stockADate } from './regles.ts';
import styles from './Stocks.module.css';
import type { InstantaneStocks } from './types.ts';

const COLONNES = [
  'matiere',
  'fin',
  'entrees',
  'sorties',
  'ajustements',
  'controle',
  'valeur',
] as const;

/** Stock au soir d'un jour au choix, avec les mouvements du jour et le dernier comptage (US-094). */
export function StockADate({ instantane }: { instantane: InstantaneStocks }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const [jour, setJour] = useState(instantane.aujourdhui);
  const { lignes, valeur } = stockADate(
    instantane.matieres,
    instantane.mouvements,
    instantane.inventaires,
    jour,
    instantane.aujourdhui,
  );

  return (
    <>
      <fieldset
        className={`${styles.jours} ${styles.sansCadre}`}
        aria-label={t('atelier.stocks.date.jours')}
      >
        {joursDuSelecteur(instantane.aujourdhui).map((j) => (
          <button
            type="button"
            key={j}
            className={`${styles.jour} ${j === jour ? styles.actif : ''}`}
            aria-pressed={j === jour}
            onClick={() => setJour(j)}
          >
            {jourCourt(j, langue)}
          </button>
        ))}
      </fieldset>
      <section
        className={styles.defilement}
        aria-label={t('atelier.stocks.date.titre', { jour: jourCourt(jour, langue) })}
      >
        <div className={styles.tableauDate}>
          <div className={styles.titreDate}>
            <h2 className={styles.titre}>
              {t('atelier.stocks.date.titre', { jour: jourCourt(jour, langue) })}
            </h2>
            <div className={styles.valeurDate} aria-live="polite">
              {t('atelier.stocks.date.valeur', { valeur: formaterNombre(valeur) })}
            </div>
          </div>
          <table className={styles.tableau}>
            <thead>
              <tr className={`${styles.entete} ${styles.colonnesDate}`}>
                {COLONNES.map((cle) => (
                  <th scope="col" key={cle}>
                    {t(`atelier.stocks.date.colonnes.${cle}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => {
                const unite = uniteMatiere(t, ligne.matiere);
                return (
                  <tr
                    className={`${styles.ligneTableau} ${styles.colonnesDate}`}
                    key={ligne.matiere}
                  >
                    <th scope="row" className={styles.gras}>
                      {nomMatiere(t, ligne.matiere)}
                    </th>
                    <td className={styles.gras}>{`${quantite(ligne.fin, langue)} ${unite}`}</td>
                    <td className={styles.entrees}>
                      {ligne.entrees ? `+${quantite(ligne.entrees, langue)}` : '—'}
                    </td>
                    <td>{ligne.sorties ? `−${quantite(ligne.sorties, langue)}` : '—'}</td>
                    <td className={styles.ajustements}>
                      {ligne.ajustements
                        ? `${ligne.ajustements > 0 ? '+' : '−'}${quantite(Math.abs(ligne.ajustements), langue)}`
                        : '—'}
                    </td>
                    <td className={styles.petit}>
                      {ligne.controle
                        ? t('atelier.stocks.date.controle', {
                            code: codeInventaire(ligne.controle.inventaire),
                            date: dateCourte(ligne.controle.inventaire.jour, langue),
                            compte: quantite(ligne.controle.compte, langue),
                          })
                        : '—'}
                    </td>
                    <td>{formaterNombre(ligne.valeur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className={styles.regle}>{t('atelier.stocks.date.regle')}</div>
    </>
  );
}
