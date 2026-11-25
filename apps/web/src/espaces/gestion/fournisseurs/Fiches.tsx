import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourCourt, nomMatiere, quantiteAvecUnite } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { facturesImpayees } from './regles.ts';
import type { Fournisseur, InstantaneFournisseurs } from './types.ts';

/** Fiches fournisseurs : matières, téléphone, conditions, dette, prochaine réception, manquant (US-100). */
type Props = {
  instantane: InstantaneFournisseurs;
  /** Le gérant crée et modifie les fiches ; le propriétaire les consulte. */
  peutModifier: boolean;
  onModifier: (fournisseur: Fournisseur) => void;
};

export function Fiches({ instantane, peutModifier, onModifier }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const impayees = facturesImpayees(instantane.factures);

  return (
    <>
      <ul className={styles.fiches} aria-label={t('gestion.fournisseurs.fiches.liste')}>
        {instantane.fournisseurs.map((f) => {
          const dues = impayees.filter((i) => i.fournisseur === f.id);
          const prochaine = instantane.commandes
            .filter((c) => c.fournisseur === f.id && c.statut === 'planifiee')
            .sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0))[0];
          const manquants = instantane.commandes.filter(
            (c) => c.fournisseur === f.id && c.statut === 'partielle',
          );
          return (
            <li className={styles.fiche} key={f.id}>
              <h2 className={styles.ficheNom}>{f.nom}</h2>
              <div className={styles.ficheSous}>
                {f.matieres.map((m) => nomMatiere(t, m)).join(', ')}
                {' · '}
                {t('gestion.fournisseurs.fiches.telephone', { numero: f.telephone })}
              </div>
              <dl className={styles.ficheDl}>
                <div className={`${styles.ficheLigne} ${styles.ficheLigneHaut}`}>
                  <dt className={styles.ficheLibelle}>
                    {t('gestion.fournisseurs.fiches.conditions')}
                  </dt>
                  <dd className={`${styles.ficheValeur} ${styles.ficheValeurDroite}`}>
                    {t(`gestion.fournisseurs.fiches.conditionsValeurs.${f.conditions}`)}
                  </dd>
                </div>
                <div className={styles.ficheLigne}>
                  <dt className={styles.ficheLibelle}>{t('gestion.fournisseurs.fiches.dette')}</dt>
                  <dd
                    className={`${styles.ficheValeur} ${styles.ficheValeurGrasse}`}
                    style={{
                      color: dues.some((i) => i.enRetard)
                        ? 'var(--ob-bloquant-texte)'
                        : 'var(--ob-encre)',
                    }}
                  >
                    {`${formaterNombre(dues.reduce((somme, i) => somme + i.montant, 0))} FCFA`}
                  </dd>
                </div>
                <div className={styles.ficheLigne}>
                  <dt className={styles.ficheLibelle}>
                    {t('gestion.fournisseurs.fiches.prochaine')}
                  </dt>
                  <dd className={styles.ficheValeur}>
                    {prochaine
                      ? `${jourCourt(prochaine.jour, langue)} · ${quantiteAvecUnite(
                          t,
                          prochaine.matiere,
                          prochaine.commandee,
                          langue,
                        )}`
                      : '—'}
                  </dd>
                </div>
                <div className={styles.ficheLigne}>
                  <dt className={styles.ficheLibelle}>
                    {t('gestion.fournisseurs.fiches.manquant')}
                  </dt>
                  <dd
                    className={`${styles.ficheValeur} ${styles.ficheValeurGrasse}`}
                    style={{
                      color: manquants.length ? 'var(--ob-surveiller-texte)' : 'var(--ob-encre)',
                    }}
                  >
                    {manquants.length
                      ? manquants
                          .map((c) =>
                            quantiteAvecUnite(t, c.matiere, c.commandee - c.recue, langue),
                          )
                          .join(', ')
                      : '—'}
                  </dd>
                </div>
              </dl>
              {peutModifier && (
                <button type="button" className={styles.secondaire} onClick={() => onModifier(f)}>
                  {t('gestion.fournisseurs.fiche.modifier', { nom: f.nom })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
