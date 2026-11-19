import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourSemaine } from '../semaines/affichage.ts';
import {
  formaterMois,
  joursAvantLaPaie,
  libelleDuStatut,
  moisPrecedent,
  niveauDuStatut,
} from './affichage.ts';
import { Mot } from './Mot.tsx';
import styles from './Personnel.module.css';
import type { DroitsPaie, TotauxPaie } from './regles.ts';
import { estModifiable, paiementOuvert } from './regles.ts';
import type { InstantanePaie } from './types.ts';

type Props = {
  instantane: InstantanePaie;
  droits: DroitsPaie;
  totaux: TotauxPaie;
  occupe: boolean;
  onChoisirLeJour: (jour: string) => void;
  onSoumettre: () => void;
  onValider: (accord: boolean) => void;
  onPayerLesRestes: () => void;
  /** Vrai serveur : prépare l'état du mois (une ligne par employé). */
  onPreparer: () => void;
};

/** En-tête de l'état de paie : titre, état, jour de paie, actions du profil et totaux. */
export function EtatDePaie({
  instantane,
  droits,
  totaux,
  occupe,
  onChoisirLeJour,
  onSoumettre,
  onValider,
  onPayerLesRestes,
  onPreparer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { statut, jourDePaie, aujourdhui } = instantane;
  const modifiable = estModifiable(statut) && droits.preparer;
  const jours = joursAvantLaPaie(aujourdhui, jourDePaie);
  const jour = jourSemaine(jourDePaie, langue);
  const decompte =
    jours === 0
      ? t('gestion.personnel.decompteAujourdhui', { jour })
      : jours > 0
        ? t('gestion.personnel.decompte', { jour, count: jours })
        : t('gestion.personnel.decomptePasse', { jour, count: -jours });

  const bloque = (suite: () => void) => () => {
    if (!occupe) suite();
  };
  const peutValider = statut === 'soumis' && droits.valider && instantane.demande !== null;
  const peutPayerTout = paiementOuvert(statut) && droits.payer && totaux.reste > 0;

  const totauxAffiches: Array<[string, number]> = [
    [t('gestion.personnel.totaux.net'), totaux.net],
    [t('gestion.personnel.totaux.paye'), totaux.paye],
    [t('gestion.personnel.totaux.reste'), totaux.reste],
    [
      t('gestion.personnel.totaux.impayes', {
        mois: moisPrecedent(instantane.mois, langue),
      }),
      totaux.impayes,
    ],
  ];

  return (
    <section className={styles.carte} aria-labelledby="etat-de-paie">
      <div className={styles.entete}>
        <div className={styles.titreEtat}>
          <h2 id="etat-de-paie" className={styles.titre}>
            {t('gestion.personnel.titreEtat', { mois: formaterMois(instantane.mois, langue) })}
          </h2>
          <Mot niveau={niveauDuStatut(statut)} className={styles.motEtat}>
            {libelleDuStatut(t, instantane)}
          </Mot>
        </div>
        <div className={styles.actions}>
          {modifiable ? (
            <label className={styles.jour}>
              {t('gestion.personnel.jourDePaie')}
              <select
                className={styles.choix}
                value={jourDePaie}
                aria-disabled={occupe}
                onChange={(e) => {
                  if (!occupe) onChoisirLeJour(e.target.value);
                }}
              >
                {instantane.joursPossibles.map((j) => (
                  <option key={j} value={j}>
                    {jourSemaine(j, langue)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className={styles.jour}>
              {t('gestion.personnel.jourDePaie')}
              <span className={styles.jourTexte}>{decompte}</span>
            </div>
          )}
          {instantane.aPreparer && droits.preparer && (
            <button
              type="button"
              className={styles.principal}
              aria-disabled={occupe}
              onClick={bloque(onPreparer)}
            >
              {t('gestion.personnel.preparer')}
            </button>
          )}
          {statut === 'brouillon' && droits.soumettre && (
            <button
              type="button"
              className={styles.principal}
              aria-disabled={occupe}
              onClick={bloque(onSoumettre)}
            >
              {t('gestion.personnel.soumettre')}
            </button>
          )}
          {peutValider && (
            <>
              <button
                type="button"
                className={styles.refuser}
                aria-disabled={occupe}
                onClick={bloque(() => onValider(false))}
              >
                {t('gestion.personnel.refuser')}
              </button>
              <button
                type="button"
                className={styles.principal}
                aria-disabled={occupe}
                onClick={bloque(() => onValider(true))}
              >
                {t('gestion.personnel.valider')}
              </button>
            </>
          )}
          {peutPayerTout && (
            <button
              type="button"
              className={styles.principal}
              aria-disabled={occupe}
              onClick={bloque(onPayerLesRestes)}
            >
              {t('gestion.personnel.payerTout', { montant: formaterNombre(totaux.reste) })}
            </button>
          )}
        </div>
      </div>
      <dl className={styles.totaux}>
        {totauxAffiches.map(([libelle, valeur]) => (
          <div key={libelle} className={styles.total}>
            <dt className={styles.totalLibelle}>{libelle}</dt>
            <dd className={styles.totalValeur}>{`${formaterNombre(valeur)} FCFA`}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
