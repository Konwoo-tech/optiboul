/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Groupe de puces de la maquette : un <fieldset> changerait la mise en page au pixel près ; role=group et aria-labelledby portent la sémantique. */
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { nomDeMatiere, uniteDeSaisie } from './affichage.ts';
import styles from './Production.module.css';
import {
  chiffresSaisis,
  consommationSaisie,
  ecartAJustifier,
  ecartDeMatiere,
  ecartEnKg,
  lireSaisie,
  limiteEcartKg,
  MATIERES_CONSOMMEES,
  motDEcart,
  theorique,
  unChiffre,
} from './regles.ts';
import {
  MOTIFS_ECART,
  type Brouillon,
  type InstantaneProduction,
  type Matiere,
  type MotifEcart,
} from './types.ts';

type Props = {
  instantane: InstantaneProduction;
  valeurs: Brouillon<Matiere>;
  lectureSeule: 'proprietaire' | 'responsable' | 'ouverture' | 'cloturee' | null;
  occupe: boolean;
  motif: MotifEcart | '';
  texte: string;
  onChange: (matiere: Matiere, texte: string) => void;
  onEnregistrer: () => void;
  onMotif: (motif: MotifEcart) => void;
  onTexte: (texte: string) => void;
  onEnvoyer: () => void;
};

/**
 * Onglet « Consommation » : la valeur de la recette à côté de chaque champ, l'écart par matière,
 * l'écart total en kg face au seuil (R10) et la justification envoyée au gérant.
 */
export function PanneauConsommation({
  instantane,
  valeurs,
  lectureSeule,
  occupe,
  motif,
  texte,
  onChange,
  onEnregistrer,
  onMotif,
  onTexte,
  onEnvoyer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const tc = (cle: string, options?: Record<string, unknown>) =>
    t(`atelier.production.consommation.${cle}`, options);
  const sacs = instantane.plan.sacs;
  const saisie = consommationSaisie(valeurs);
  const kg = ecartEnKg(saisie, sacs);
  const limite = limiteEcartKg(instantane.seuilEcartKg, sacs);
  const alerte = ecartAJustifier(kg, limite);
  const conforme = !alerte && kg !== 0;
  const envoyee = instantane.justification;

  return (
    <section className={`${styles.carte} ${styles.carteSaisie}`} aria-labelledby="titre-conso">
      <div>
        <h2 className={styles.titre} id="titre-conso">
          {tc('titre')}
        </h2>
        <div className={styles.sousTitre}>{tc('sous')}</div>
      </div>
      {MATIERES_CONSOMMEES.map((matiere) => {
        const unite = uniteDeSaisie(t, matiere);
        const reel = lireSaisie(valeurs[matiere]);
        const { ecart, pourcent } = ecartDeMatiere(matiere, reel ?? 0, sacs);
        const mot = motDEcart(pourcent);
        const nom = nomDeMatiere(t, matiere);
        return (
          <div className={`${styles.ligneSaisie} ${styles.ligneConso}`} key={matiere}>
            <div className={styles.matiereSaisie}>{nom}</div>
            <div className={styles.colonneAttendu}>
              <div className={styles.petitLibelle}>{tc('prevu')}</div>
              <div className={styles.attenduValeur}>
                {`${formaterNombre(theorique(matiere, sacs))} ${unite}`}
              </div>
            </div>
            <div className={styles.champMoyenEtUnite}>
              <input
                id={`conso-${matiere}`}
                className={styles.champMoyen}
                value={valeurs[matiere]}
                onChange={(e) => onChange(matiere, chiffresSaisis(e.target.value))}
                disabled={lectureSeule !== null}
                inputMode="numeric"
                placeholder="0"
                aria-label={tc('champ', { matiere: nom, unite })}
              />
              <span className={styles.unite}>{unite}</span>
            </div>
            <div className={styles.ecartMoyen}>
              {reel === null ? '—' : `${ecart > 0 ? '+' : ''}${formaterNombre(ecart)} ${unite}`}
            </div>
            {reel !== null && (
              <span
                className={styles.mot}
                style={{ background: `var(--ob-${mot}-fond)`, color: `var(--ob-${mot}-texte)` }}
              >
                {t(`atelier.production.mots.${mot}`)}
              </span>
            )}
          </div>
        );
      })}
      {conforme && (
        <output className={styles.conformeBloc}>
          {tc('conforme', { ecart: unChiffre(kg, langue), limite: formaterNombre(limite) })}
        </output>
      )}
      {alerte && (
        <div className={styles.alerte} role="alert">
          <p className={styles.alerteTexte}>
            {tc('alerte', {
              ecart: unChiffre(kg, langue),
              seuil: instantane.seuilEcartKg,
              limite: formaterNombre(limite),
              sacs,
            })}
          </p>
          {!envoyee && lectureSeule === null && (
            <>
              <p className={styles.alerteTitre} id="titre-justification">
                {tc('justifier')}
              </p>
              <div
                className={styles.alerteSaisie}
                role="group"
                aria-labelledby="titre-justification"
              >
                {MOTIFS_ECART.map((m) => (
                  <button
                    type="button"
                    key={m}
                    id={`justification-motif-${m}`}
                    className={`${styles.puce} ${motif === m ? styles.puceActive : ''}`}
                    aria-pressed={motif === m}
                    onClick={() => onMotif(m)}
                  >
                    {tc(`motifs.${m}`)}
                  </button>
                ))}
              </div>
              <div className={styles.alerteSaisie}>
                <input
                  className={styles.champJustification}
                  value={texte}
                  onChange={(e) => onTexte(e.target.value)}
                  placeholder={tc('precisez')}
                  aria-label={tc('precisez')}
                />
                <button
                  type="button"
                  className={styles.envoyer}
                  disabled={occupe}
                  onClick={onEnvoyer}
                >
                  {tc('envoyer')}
                </button>
              </div>
            </>
          )}
          {envoyee && (
            <p className={styles.alerteEnvoyee}>
              {tc('envoyee', { motif: tc(`motifs.${envoyee.motif}`) })}
            </p>
          )}
        </div>
      )}
      {lectureSeule && (
        <p className={styles.lectureSeule}>
          {t(`atelier.production.realise.lecture.${lectureSeule}`)}
        </p>
      )}
      {lectureSeule === null && (
        <button
          type="button"
          className={styles.enregistrer}
          disabled={occupe}
          onClick={onEnregistrer}
        >
          {tc('enregistrer')}
        </button>
      )}
    </section>
  );
}
