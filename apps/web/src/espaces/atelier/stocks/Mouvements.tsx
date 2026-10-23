import { useTranslation } from '@/i18n';
import { useId, useRef, useState } from 'react';

import {
  jourEtHeure,
  libelleOrigine,
  nomMatiere,
  quantite,
  signeDuMouvement,
  uniteMatiere,
} from './affichage.ts';
import { Mot } from './Mot.tsx';
import {
  erreurDeMouvement,
  filtrerMouvements,
  NIVEAU_MOUVEMENT,
  quantiteSaisie,
  type FiltreMouvement,
} from './regles.ts';
import styles from './Stocks.module.css';
import {
  MATIERES,
  TYPES_MOUVEMENT,
  TYPES_SAISIS,
  type InstantaneStocks,
  type Matiere,
  type NouveauMouvement,
  type TypeSaisi,
} from './types.ts';

type Props = {
  instantane: InstantaneStocks;
  /** Le gérant et le chef de production saisissent ; le propriétaire consulte. */
  peutSaisir: boolean;
  /** Renvoie le code de l'erreur du serveur, ou `null` quand le mouvement est enregistré. */
  onEnregistrer: (mouvement: NouveauMouvement) => Promise<string | null>;
};

const COULEUR_QUANTITE: Record<string, string> = {
  entree: 'var(--ob-ok-texte)',
  ajustement: 'var(--ob-surveiller-texte)',
};

/** Entrées et sorties : mouvements filtrables et saisie d'une perte ou d'une correction (US-091, US-092). */
export function Mouvements({ instantane, peutSaisir, onEnregistrer }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const idErreur = useId();
  const [filtre, setFiltre] = useState<FiltreMouvement>('all');
  const [type, setType] = useState<TypeSaisi>('perte');
  const [matiere, setMatiere] = useState<Matiere>('farine');
  const [quantiteTexte, setQuantiteTexte] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const champQuantite = useRef<HTMLInputElement>(null);
  const champMotif = useRef<HTMLInputElement>(null);

  const mouvements = filtrerMouvements(instantane.mouvements, filtre);
  const puce = (actif: boolean) => `${styles.puce} ${actif ? styles.actif : ''}`;
  const message = erreur
    ? t(
        `atelier.stocks.mouvements.erreurs.${
          [
            'quantite',
            'motif',
            'quantite_obligatoire',
            'motif_obligatoire',
            'stock_insuffisant',
          ].includes(erreur)
            ? erreur
            : 'defaut'
        }`,
      )
    : '';

  const valider = async () => {
    const trouvee = erreurDeMouvement(quantiteTexte, motif);
    setErreur(trouvee);
    if (trouvee) {
      // Le focus va au champ fautif : le clavier reprend là où il faut corriger.
      (trouvee === 'quantite' ? champQuantite : champMotif).current?.focus();
      return;
    }
    const refus = await onEnregistrer({
      type,
      matiere,
      quantite: quantiteSaisie(quantiteTexte),
      motif: motif.trim(),
    });
    if (refus) {
      setErreur(refus);
      return;
    }
    setQuantiteTexte('');
    setMotif('');
  };

  return (
    <div className={styles.mouvements}>
      <section className={styles.liste} aria-label={t('atelier.stocks.mouvements.liste')}>
        <div className={styles.filtres}>
          <fieldset
            className={`${styles.puces} ${styles.sansCadre}`}
            aria-label={t('atelier.stocks.mouvements.filtre')}
          >
            {(['all', ...TYPES_MOUVEMENT] as const).map((cle) => (
              <button
                type="button"
                key={cle}
                className={puce(filtre === cle)}
                aria-pressed={filtre === cle}
                onClick={() => setFiltre(cle)}
              >
                {t(`atelier.stocks.mouvements.filtres.${cle}`)}
              </button>
            ))}
          </fieldset>
          <div className={styles.regleMouvements}>{t('atelier.stocks.mouvements.regle')}</div>
        </div>
        <ul className={styles.lignes}>
          {mouvements.map((m) => (
            <li className={styles.mouvement} key={m.id}>
              <Mot niveau={NIVEAU_MOUVEMENT[m.type]}>
                {t(`atelier.stocks.mouvements.types.${m.type}`)}
              </Mot>
              <div className={styles.mouvementTexte}>
                <div className={styles.mouvementTitre}>
                  {nomMatiere(t, m.matiere)}
                  {' · '}
                  <span
                    className={styles.quantite}
                    style={{ color: COULEUR_QUANTITE[m.type] ?? 'var(--ob-encre)' }}
                  >
                    {`${signeDuMouvement(m.type, m.quantite)}${quantite(
                      Math.abs(m.quantite),
                      langue,
                    )} ${uniteMatiere(t, m.matiere)}`}
                  </span>
                </div>
                <div className={styles.mouvementRef}>{libelleOrigine(t, m.origine, langue)}</div>
              </div>
              <div className={styles.mouvementQuand}>
                <div>{jourEtHeure(m.jour, m.heure, langue)}</div>
                <div>{m.par}</div>
              </div>
            </li>
          ))}
        </ul>
        {mouvements.length === 0 && (
          <div className={styles.vide}>{t('atelier.stocks.mouvements.vide')}</div>
        )}
      </section>

      {peutSaisir && (
        <form
          className={styles.formulaire}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void valider();
          }}
        >
          <h2 className={styles.titre}>{t('atelier.stocks.mouvements.manuel.titre')}</h2>
          <fieldset
            className={`${styles.puces} ${styles.sansCadre}`}
            aria-label={t('atelier.stocks.mouvements.manuel.type')}
          >
            {TYPES_SAISIS.map((cle) => (
              <button
                type="button"
                key={cle}
                className={puce(type === cle)}
                aria-pressed={type === cle}
                onClick={() => {
                  setType(cle);
                  setErreur(null);
                }}
              >
                {t(`atelier.stocks.mouvements.manuel.types.${cle}`)}
              </button>
            ))}
          </fieldset>
          <label className={styles.etiquette}>
            {t('atelier.stocks.mouvements.manuel.matiere')}
            <select
              className={styles.champ}
              value={matiere}
              onChange={(e) => {
                setMatiere(e.target.value as Matiere);
                setErreur(null);
              }}
            >
              {MATIERES.map((cle) => (
                <option key={cle} value={cle}>
                  {`${nomMatiere(t, cle)} (${uniteMatiere(t, cle)})`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.etiquette}>
            {t('atelier.stocks.mouvements.manuel.quantite')}
            <input
              className={styles.champ}
              ref={champQuantite}
              value={quantiteTexte}
              inputMode="decimal"
              onChange={(e) => {
                setQuantiteTexte(e.target.value.replace(/[^\d.,]/g, ''));
                setErreur(null);
              }}
              aria-invalid={erreur === 'quantite' || erreur === 'quantite_obligatoire'}
              aria-describedby={idErreur}
            />
          </label>
          <label className={styles.etiquette}>
            {t('atelier.stocks.mouvements.manuel.motif')}
            <input
              className={styles.champ}
              ref={champMotif}
              value={motif}
              onChange={(e) => {
                setMotif(e.target.value);
                setErreur(null);
              }}
              aria-invalid={erreur === 'motif' || erreur === 'motif_obligatoire'}
              aria-describedby={idErreur}
            />
          </label>
          <span className={styles.erreur} id={idErreur} role={message ? 'alert' : undefined}>
            {message}
          </span>
          <button type="submit" className={styles.principal}>
            {t('atelier.stocks.mouvements.manuel.enregistrer')}
          </button>
        </form>
      )}
    </div>
  );
}
