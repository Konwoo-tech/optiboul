import { produitsFichesList } from '@/api';
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useQuery } from '@tanstack/react-query';

import { dateCourte } from './affichage.ts';
import styles from './Fiche.module.css';

type Props = {
  /** Identifiant du produit sur le serveur ; sans lui, rien à lire. */
  idServeur: number | undefined;
  /** Change à chaque nouvelle version : l'historique se relit. */
  version: number;
};

const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(new Date(iso));

/** Versions successives de la fiche d'un produit, de la plus récente à la plus ancienne. */
export function VersionsFiche({ idServeur, version }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const requete = useQuery({
    queryKey: ['atelier', 'production', 'versions-fiche', idServeur, version],
    enabled: idServeur !== undefined,
    queryFn: async () => (await produitsFichesList(idServeur as number)).data.results ?? [],
  });
  const versions = [...(requete.data ?? [])].sort((a, b) => b.version - a.version);
  if (idServeur === undefined || versions.length === 0) return null;

  return (
    <section className={styles.carte} aria-labelledby="titre-versions">
      <div className={styles.carteIngredients}>
        <h3 className={`${styles.titre} ${styles.titreIngredients}`} id="titre-versions">
          {t('atelier.production.fiche.versions.titre')}
        </h3>
        <div className={styles.sousTitre}>{t('atelier.production.fiche.versions.sous')}</div>
        <ul className={styles.listeVersions}>
          {versions.map((v) => (
            <li className={styles.ligneVersion} key={v.version}>
              <span className={styles.numeroVersion}>
                {t('atelier.production.fiche.versions.numero', { version: v.version })}
              </span>
              <span className={styles.etapeDetail}>
                {dateCourte(jourDeYaounde(v.cree_le), langue)}
                {v.cree_par_nom ? ` · ${v.cree_par_nom}` : ''}
              </span>
              <span className={styles.etapeDetail}>
                {t('atelier.production.fiche.versions.rendement', {
                  pains: formaterNombre(v.pains_par_sac),
                  boule: formaterNombre(v.poids_boule),
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
