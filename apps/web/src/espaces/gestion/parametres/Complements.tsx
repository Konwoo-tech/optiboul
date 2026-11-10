import { useTranslation } from '@/i18n';
import { useId, useState } from 'react';

import { dateHeure, libelleDe, valeurLisible } from './affichage.ts';
import { useHistorique } from './api.ts';
import { ChampParametre, type Enregistrer } from './Champs.tsx';
import styles from './Parametres.module.css';
import type { GroupeAffiche } from './regles.ts';
import type { Parametre } from './types.ts';

/**
 * Sous la maquette : tous les autres paramètres du cahier des charges §9, rangés par famille, avec
 * la valeur par défaut et la dernière modification. Ces blocs ne figurent pas dans la maquette.
 */
export function AutresParametres({
  groupes,
  lecture,
  enregistrer,
}: {
  groupes: GroupeAffiche[];
  lecture: boolean;
  enregistrer: Enregistrer;
}) {
  const { t, i18n } = useTranslation();
  const titre = useId();
  return (
    <section className={styles.carte} aria-labelledby={titre}>
      <h2 id={titre} className={styles.titre}>
        {t('gestion.parametres.autres.titre')}
      </h2>
      <p className={styles.note}>{t('gestion.parametres.autres.aide')}</p>
      {groupes.map((g) => (
        <div key={g.cle} className={styles.groupe}>
          <h3 className={styles.groupeTitre}>{t(`gestion.parametres.groupes.${g.cle}`)}</h3>
          <ul className={styles.liste}>
            {g.parametres.map((p) => (
              <li key={p.cle} className={styles.parametre}>
                <div className={styles.parametreNom}>
                  {libelleDe(t, p)}
                  <span className={styles.meta}>
                    {t('gestion.parametres.valeurParDefaut', {
                      valeur: valeurLisible(t, p, p.defaut),
                    })}
                    {p.modifie_le
                      ? ` · ${t('gestion.parametres.modifiePar', {
                          date: dateHeure(p.modifie_le, i18n.language),
                          par: p.modifie_par,
                        })}`
                      : ''}
                  </span>
                </div>
                <div className={styles.controle}>
                  <ChampParametre parametre={p} lecture={lecture} enregistrer={enregistrer} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Historique des valeurs (US-023) : choisir un paramètre, lire ses valeurs successives. */
export function HistoriqueDesValeurs({
  parametres,
  utilisateur,
}: {
  parametres: Parametre[];
  utilisateur: string;
}) {
  const { t, i18n } = useTranslation();
  const titre = useId();
  const selecteur = useId();
  const [cle, setCle] = useState(parametres[0]?.cle ?? '');
  const requete = useHistorique(utilisateur, cle);
  const courant = parametres.find((p) => p.cle === cle);
  const valeurs = requete.data ?? [];

  return (
    <section className={styles.carte} aria-labelledby={titre}>
      <h2 id={titre} className={styles.titre}>
        {t('gestion.parametres.historique.titre')}
      </h2>
      <label className={styles.etiquette} htmlFor={selecteur}>
        {t('gestion.parametres.historique.choisir')}
        <select
          id={selecteur}
          className={styles.selecteur}
          value={cle}
          onChange={(e) => setCle(e.target.value)}
        >
          {parametres.map((p) => (
            <option key={p.cle} value={p.cle}>
              {libelleDe(t, p)}
            </option>
          ))}
        </select>
      </label>
      {requete.isError ? (
        <p role="alert" className={styles.erreur}>
          {t('gestion.parametres.historique.erreurChargement')}
        </p>
      ) : requete.isPending ? null : valeurs.length === 0 ? (
        <p className={styles.note}>{t('gestion.parametres.historique.vide')}</p>
      ) : (
        <table className={styles.historique}>
          <thead>
            <tr>
              <th scope="col">{t('gestion.parametres.historique.colonnes.date')}</th>
              <th scope="col">{t('gestion.parametres.historique.colonnes.valeur')}</th>
              <th scope="col">{t('gestion.parametres.historique.colonnes.auteur')}</th>
            </tr>
          </thead>
          <tbody>
            {valeurs.map((v, rang) => (
              <tr key={`${v.le}-${rang}`}>
                <td>{dateHeure(v.le, i18n.language)}</td>
                <td>{courant ? valeurLisible(t, courant, v.valeur) : String(v.valeur)}</td>
                <td>{v.auteur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
