import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useNavigate } from 'react-router';

import { libelleAuteur, libelleDemande, libelleRattachement } from './affichage.ts';
import styles from './Depenses.module.css';
import {
  demandeDe,
  filtrerDepenses,
  numeroDepense,
  semainesAvecDepenses,
  type FiltreRattachement,
  type FiltreSemaine,
} from './regles.ts';
import { TYPES_RATTACHEMENT, type InstantaneDepenses, type StatutDepense } from './types.ts';

const NIVEAU_STATUT: Record<StatutDepense, 'ok' | 'surveiller' | 'bloquant' | 'neutre'> = {
  validee: 'ok',
  'en-attente': 'surveiller',
  refusee: 'bloquant',
  annulee: 'neutre',
};

type Props = {
  instantane: InstantaneDepenses;
  semaine: FiltreSemaine;
  rattachement: FiltreRattachement;
  onSemaine: (semaine: FiltreSemaine) => void;
  onRattachement: (rattachement: FiltreRattachement) => void;
  /** Chemin de l'écran des demandes, selon l'espace de la personne connectée. */
  cheminDemandes: string;
};

/** Liste filtrable des dépenses, avec la demande de validation liée à chacune. */
export function Liste({
  instantane,
  semaine,
  rattachement,
  onSemaine,
  onRattachement,
  cheminDemandes,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const langue = i18n.language;
  const liste = filtrerDepenses(instantane.depenses, semaine, rattachement);
  const somme = liste.reduce((total, d) => total + d.montant, 0);
  const numeroDeSemaine = (id: string) => instantane.semaines.find((s) => s.id === id)?.numero;
  const puce = (actif: boolean) => `${styles.puce} ${actif ? styles.puceActive : ''}`;

  return (
    <section className={styles.liste} aria-label={t('comptoir.depenses.liste.titre')}>
      <div className={styles.filtres}>
        <fieldset
          className={`${styles.puces} ${styles.sansCadre}`}
          aria-label={t('comptoir.depenses.liste.filtreSemaine')}
        >
          <button
            type="button"
            className={puce(semaine === 'all')}
            aria-pressed={semaine === 'all'}
            onClick={() => onSemaine('all')}
          >
            {t('comptoir.depenses.liste.toutesLesSemaines')}
          </button>
          {semainesAvecDepenses(instantane.semaines, instantane.depenses).map((s) => (
            <button
              type="button"
              key={s.id}
              className={puce(semaine === s.id)}
              aria-pressed={semaine === s.id}
              onClick={() => onSemaine(s.id)}
            >
              {t('comptoir.depenses.liste.semaine', { numero: s.numero })}
            </button>
          ))}
        </fieldset>
        <fieldset
          className={`${styles.puces} ${styles.sansCadre}`}
          aria-label={t('comptoir.depenses.liste.filtreRattachement')}
        >
          {(['all', ...TYPES_RATTACHEMENT] as const).map((cle) => (
            <button
              type="button"
              key={cle}
              className={puce(rattachement === cle)}
              aria-pressed={rattachement === cle}
              onClick={() => onRattachement(cle)}
            >
              {t(`comptoir.depenses.liste.rattachements.${cle}`)}
            </button>
          ))}
        </fieldset>
        <span className={styles.total} aria-live="polite">
          {t(
            liste.length === 1
              ? 'comptoir.depenses.liste.totalUne'
              : 'comptoir.depenses.liste.total',
            {
              nombre: liste.length,
              montant: formaterNombre(somme),
            },
          )}
        </span>
      </div>
      <ul className={styles.lignes}>
        {liste.map((depense) => {
          const demande = demandeDe(depense, instantane.demandes);
          const niveau = NIVEAU_STATUT[depense.statut];
          return (
            <li className={styles.ligne} key={depense.id}>
              <div className={styles.ligneTexte}>
                <span className={styles.ligneTitre}>
                  {numeroDepense(depense.numero)} · {depense.libelle}
                </span>
                <span className={styles.ligneRattache}>
                  {t(`comptoir.depenses.categories.${depense.categorie}`)}
                  {' · '}
                  {libelleRattachement(
                    t,
                    depense.rattachement,
                    numeroDeSemaine(depense.semaine),
                    langue,
                  )}
                </span>
                <span className={styles.ligneQui}>{libelleAuteur(t, depense, langue)}</span>
                {demande && (
                  <button
                    type="button"
                    className={styles.demande}
                    onClick={() => void navigate(cheminDemandes)}
                  >
                    {libelleDemande(t, demande, instantane.gerantDeLaSemaine, langue)}
                  </button>
                )}
              </div>
              <div className={styles.ligneDroite}>
                <span className={styles.ligneMontant}>{formaterNombre(depense.montant)} FCFA</span>
                <span
                  className={styles.statut}
                  style={{
                    background: `var(--ob-${niveau}-fond)`,
                    color: `var(--ob-${niveau}-texte)`,
                  }}
                >
                  {t(`comptoir.depenses.statuts.${depense.statut}`)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {liste.length === 0 && <div className={styles.vide}>{t('comptoir.depenses.liste.vide')}</div>}
    </section>
  );
}
