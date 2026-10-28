import { useTranslation } from '@/i18n';
import { formaterNombre, formaterNombreSigne } from '@/utils';
import { useNavigate } from 'react-router';

import type { Profil } from '../../../profils.ts';
import { lienVers } from './liens.ts';
import styles from './Semaines.module.css';
import type { Indicateurs } from './types.ts';

type Props = { semaine: string; indicateurs: Indicateurs; profil: Profil };

/** Chiffres de la semaine et liens vers les écrans qui y sont rattachés (maquette : `kpis`, `links`). */
export function Chiffres({ semaine, indicateurs, profil }: Props) {
  const { t } = useTranslation();
  const naviguer = useNavigate();

  const kpis = [
    [t('gestion.semaines.indicateurs.recette'), `${formaterNombre(indicateurs.recette)} FCFA`],
    [
      t('gestion.semaines.indicateurs.depenses'),
      `${formaterNombre(indicateurs.depenses.montant)} FCFA`,
    ],
    [
      t('gestion.semaines.indicateurs.productions'),
      t('gestion.semaines.indicateurs.productionsValeur', {
        nombre: indicateurs.productions.nombre,
        sacs: indicateurs.productions.sacs,
      }),
    ],
    [
      t('gestion.semaines.indicateurs.ecart'),
      `${formaterNombreSigne(indicateurs.ecartCumule)} FCFA`,
    ],
  ] as const;

  const liens = [
    [t('gestion.semaines.liens.caisses'), indicateurs.caisses, lienVers(profil, 'caisses')],
    [
      t('gestion.semaines.liens.productions'),
      indicateurs.productions.nombre,
      lienVers(profil, 'production'),
    ],
    [
      t('gestion.semaines.liens.depenses'),
      indicateurs.depenses.nombre,
      lienVers(profil, 'depenses', { semaine }),
    ],
    [
      t('gestion.semaines.liens.receptions'),
      indicateurs.receptions,
      lienVers(profil, 'fournisseurs', { onglet: 'receptions' }),
    ],
  ] as const;

  return (
    <section
      className={`${styles.carte} ${styles.carteChiffres}`}
      aria-label={t('gestion.semaines.liens.titre')}
    >
      <div className={styles.indicateurs}>
        {kpis.map(([libelle, valeur]) => (
          <div className={styles.indicateur} key={libelle}>
            <div className={styles.indicateurLibelle}>{libelle}</div>
            <div className={styles.indicateurValeur}>{valeur}</div>
          </div>
        ))}
      </div>
      <h3 className={styles.titreLiens}>{t('gestion.semaines.liens.titre')}</h3>
      <div className={styles.liens}>
        {liens.map(([libelle, nombre, chemin]) => (
          <button
            type="button"
            key={libelle}
            className={`${styles.lien} ${chemin ? '' : styles.lienInactif}`}
            disabled={!chemin}
            onClick={() => chemin && naviguer(chemin)}
          >
            <span className={styles.lienLibelle}>{libelle}</span>
            <span className={styles.lienValeur}>{nombre} ›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
