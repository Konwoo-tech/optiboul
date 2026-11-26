import { Paginee } from '@/ui';
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourCourt, libelleFacture } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { Mot } from './Mot.tsx';
import { etatDeFacture, NIVEAU_FACTURE, sePaie } from './regles.ts';
import type { Facture, InstantaneFournisseurs } from './types.ts';

type Props = {
  instantane: InstantaneFournisseurs;
  /** Le gérant paie ; le propriétaire consulte. */
  peutModifier: boolean;
  enCours: boolean;
  onPayer: (facture: Facture) => void;
  onRecu: (facture: Facture) => void;
  onHistorique: (facture: Facture) => void;
};

/** Factures et dettes fournisseurs : à payer, en cours, en retard, payées (US-103). */
export function Factures({
  instantane,
  peutModifier,
  enCours,
  onPayer,
  onRecu,
  onHistorique,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const nomFournisseur = (id: string) =>
    instantane.fournisseurs.find((f) => f.id === id)?.nom ?? '';

  return (
    <section className={styles.carte} aria-label={t('gestion.fournisseurs.factures.liste')}>
      <div className={styles.regle}>{t('gestion.fournisseurs.factures.regle')}</div>
      <Paginee elements={instantane.factures}>
        {(page) => (
          <ul className={styles.lignes}>
            {page.map((f) => {
              const etat = etatDeFacture(f);
              return (
                <li className={styles.ligne} key={f.numero}>
                  <Mot niveau={NIVEAU_FACTURE[etat]}>
                    {t(`gestion.fournisseurs.factures.statuts.${etat}`)}
                  </Mot>
                  <div className={styles.texteFacture}>
                    <div className={styles.titre}>
                      {f.numero}
                      {' · '}
                      {libelleFacture(t, f, langue)}
                    </div>
                    <div className={styles.sous}>
                      {nomFournisseur(f.fournisseur)}
                      {' · '}
                      {f.statut === 'payee' && f.payeeLe && f.mode
                        ? t('gestion.fournisseurs.factures.payeeLe', {
                            date: jourCourt(f.payeeLe, langue),
                            mode: t(`gestion.fournisseurs.modes.${f.mode}`),
                          })
                        : t('gestion.fournisseurs.factures.echeance', {
                            date: jourCourt(f.echeance, langue),
                          })}
                      {f.statut === 'payee' && f.reference
                        ? t('gestion.fournisseurs.factures.reference', { reference: f.reference })
                        : null}
                    </div>
                  </div>
                  <span className={styles.montant}>
                    {formaterNombre(f.montant)}
                    {' FCFA'}
                  </span>
                  {peutModifier && sePaie(f) && (
                    <button
                      type="button"
                      className={styles.principal}
                      aria-disabled={enCours}
                      aria-label={`${t('gestion.fournisseurs.factures.payer')} ${f.numero}`}
                      onClick={() => !enCours && onPayer(f)}
                    >
                      {t('gestion.fournisseurs.factures.payer')}
                    </button>
                  )}
                  {f.statut === 'payee' && f.idServeur !== undefined && (
                    <button
                      type="button"
                      className={styles.secondaire}
                      aria-label={`${t('gestion.fournisseurs.factures.historique')} ${f.numero}`}
                      onClick={() => onHistorique(f)}
                    >
                      {t('gestion.fournisseurs.factures.historique')}
                    </button>
                  )}
                  {f.statut === 'payee' && (
                    <button
                      type="button"
                      className={styles.secondaire}
                      aria-label={`${t('gestion.fournisseurs.factures.recu')} ${f.numero}`}
                      onClick={() => onRecu(f)}
                    >
                      {t('gestion.fournisseurs.factures.recu')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Paginee>
    </section>
  );
}
