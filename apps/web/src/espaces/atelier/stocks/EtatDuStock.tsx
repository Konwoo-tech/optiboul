import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourCourt, nomMatiere, quantite, uniteMatiere } from './affichage.ts';
import { Mot } from './Mot.tsx';
import { NIVEAU_STOCK, niveauDuStock, sessionsAffichees, valeurDuStock } from './regles.ts';
import styles from './Stocks.module.css';
import type { InstantaneStocks } from './types.ts';

const COLONNES = ['matiere', 'enStock', 'parSession', 'sessions', 'prochaine', 'valeur'] as const;

/** État du stock par matière : quantité, besoin par session, sessions restantes, statut (US-090). */
export function EtatDuStock({ instantane }: { instantane: InstantaneStocks }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { matieres, receptions, sacsParSession } = instantane;

  return (
    <section className={styles.defilement} aria-label={t('atelier.stocks.etat.titre')}>
      <div className={styles.tableauEtat}>
        <div className={styles.total}>
          {sacsParSession === undefined
            ? t('atelier.stocks.etat.totalSansSacs', {
                valeur: formaterNombre(valeurDuStock(matieres)),
              })
            : t('atelier.stocks.etat.total', {
                valeur: formaterNombre(valeurDuStock(matieres)),
                sacs: sacsParSession,
              })}
        </div>
        <table className={styles.tableau}>
          <thead>
            <tr className={`${styles.entete} ${styles.enteteEtat} ${styles.colonnesEtat}`}>
              {COLONNES.map((cle) => (
                <th scope="col" key={cle}>
                  {t(`atelier.stocks.etat.colonnes.${cle}`)}
                </th>
              ))}
              <th scope="col">
                <span className={styles.legende}>{t('atelier.stocks.etat.colonnes.statut')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matieres.map((m) => {
              const niveau = niveauDuStock(m.stock, m.besoin);
              const prochaine = receptions.find((r) => r.matiere === m.cle);
              const unite = uniteMatiere(t, m.cle);
              return (
                <tr className={`${styles.ligneTableau} ${styles.colonnesEtat}`} key={m.cle}>
                  <th scope="row" className={styles.gras}>
                    {nomMatiere(t, m.cle)}
                  </th>
                  <td>{`${quantite(m.stock, langue)} ${unite}`}</td>
                  <td>{`${quantite(m.besoin, langue)} ${unite}`}</td>
                  <td className={styles.gras}>
                    {quantite(sessionsAffichees(m.stock, m.besoin), langue)}
                  </td>
                  <td className={styles.petit}>
                    {prochaine
                      ? `${jourCourt(prochaine.jour, langue)} · ${quantite(prochaine.quantite, langue)} ${unite}`
                      : '—'}
                  </td>
                  <td>{formaterNombre(Math.round(m.stock * m.prix))}</td>
                  <Mot cellule niveau={NIVEAU_STOCK[niveau]} className={styles.motDansTableau}>
                    {t(`atelier.stocks.etat.niveaux.${niveau}`)}
                  </Mot>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
