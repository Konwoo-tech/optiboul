import { useTranslation } from '@/i18n';
import { useRef } from 'react';

import {
  codeInventaire,
  jourCourt,
  nomMatiere,
  resumeDesEcarts,
  uniteMatiere,
} from './affichage.ts';
import { Mot } from './Mot.tsx';
import {
  comptageSaisi,
  controleDuJour,
  inventaireDuJour,
  lignesEnEcart,
  NIVEAU_CONTROLE,
  NIVEAU_INVENTAIRE,
  statutControle,
} from './regles.ts';
import styles from './Stocks.module.css';
import { type InstantaneStocks, type Matiere, type NouvelInventaire } from './types.ts';

/** Comptages saisis, par matière (texte tel que tapé) ; `null` : aucun inventaire en cours. */
export type BrouillonInventaire = Partial<Record<Matiere, string>> | null;

type Props = {
  instantane: InstantaneStocks;
  /** Le gérant et le chef de production comptent ; le propriétaire consulte. */
  peutSaisir: boolean;
  nom: string;
  brouillon: BrouillonInventaire;
  enregistrement: boolean;
  onBrouillon: (brouillon: BrouillonInventaire) => void;
  onSoumettre: (inventaire: NouvelInventaire) => void;
  /** Appelé quand on soumet avant d'avoir compté toutes les matières. */
  onIncomplet: () => void;
};

/** Contrôles du mercredi et du dimanche, comptage guidé et historique des inventaires (US-093). */
export function Inventaires({
  instantane,
  peutSaisir,
  nom,
  brouillon,
  enregistrement,
  onBrouillon,
  onSoumettre,
  onIncomplet,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const champs = useRef<Partial<Record<Matiere, HTMLInputElement | null>>>({});
  const { aujourdhui, controles, inventaires } = instantane;
  // Sur le vrai serveur, le contrôle ne fait compter que certaines matières, à l'aveugle (O13).
  const matieres = instantane.matieresACompter
    ? instantane.matieres.filter((m) => instantane.matieresACompter?.includes(m.cle))
    : instantane.matieres;
  const aFaire = controleDuJour(controles, inventaires, aujourdhui);

  const soumettre = () => {
    if (!brouillon) return;
    const comptages: NouvelInventaire['comptages'] = {};
    for (const { cle } of matieres) {
      const valeur = comptageSaisi(brouillon[cle] ?? '');
      if (valeur === null) {
        // Le focus va à la première matière non comptée.
        champs.current[cle]?.focus();
        onIncomplet();
        return;
      }
      comptages[cle] = valeur;
    }
    onSoumettre({ comptages });
  };

  return (
    <>
      <section className={styles.carte} aria-labelledby="titre-controles-stock">
        <div className={styles.controlesEntete}>
          <div className={styles.controlesTitres}>
            <h2 className={styles.titre} id="titre-controles-stock">
              {t('atelier.stocks.inventaires.titre')}
            </h2>
            <p className={styles.sousTitre}>{t('atelier.stocks.inventaires.sousTitre')}</p>
          </div>
          {aFaire && (
            <Mot niveau="surveiller" className={styles.aFaire}>
              {t('atelier.stocks.inventaires.aFaire', { date: jourCourt(aFaire.jour, langue) })}
            </Mot>
          )}
        </div>
        <ul className={styles.lignes}>
          {controles.map((c) => {
            const inventaire = inventaireDuJour(inventaires, c.jour);
            const statut = statutControle(c.jour, aujourdhui, inventaire);
            return (
              <li className={styles.controle} key={c.jour}>
                <span className={styles.controleSemaine}>
                  {t('atelier.stocks.inventaires.semaine', { numero: c.semaine })}
                </span>
                <div className={styles.controleJour}>
                  <span className={styles.controleDate}>{jourCourt(c.jour, langue)}</span>
                  <span className={styles.controleMoment}>
                    {t(`atelier.stocks.inventaires.moments.${c.moment}`)}
                  </span>
                </div>
                <span className={styles.controleQui}>
                  {t('atelier.stocks.inventaires.qui', {
                    gerant: c.gerant,
                    responsable: c.responsableProduction,
                  })}
                </span>
                <span className={styles.controleRef}>
                  {inventaire
                    ? t('atelier.stocks.inventaires.ecarts', {
                        code: codeInventaire(inventaire),
                        nombre: lignesEnEcart(inventaire).length,
                      })
                    : '—'}
                </span>
                <Mot niveau={NIVEAU_CONTROLE[statut]}>
                  {t(`atelier.stocks.inventaires.statutsControle.${statut}`)}
                </Mot>
              </li>
            );
          })}
        </ul>
      </section>

      {!brouillon && (
        <div className={styles.demarrer}>
          <div className={styles.regleInventaire}>{t('atelier.stocks.inventaires.regle')}</div>
          {peutSaisir && (
            <button type="button" className={styles.principal} onClick={() => onBrouillon({})}>
              {t('atelier.stocks.inventaires.demarrer')}
            </button>
          )}
        </div>
      )}

      {brouillon && peutSaisir && (
        <form
          className={styles.comptageCarte}
          noValidate
          aria-labelledby="titre-comptage-stock"
          onSubmit={(e) => {
            e.preventDefault();
            soumettre();
          }}
        >
          <h2 className={styles.titre} id="titre-comptage-stock">
            {t('atelier.stocks.inventaires.enCours', { nom })}
          </h2>
          <div className={styles.regleComptage}>{t('atelier.stocks.inventaires.regle')}</div>
          {matieres.map((m) => {
            const texte = brouillon[m.cle] ?? '';
            const unite = uniteMatiere(t, m.cle);
            return (
              <div className={styles.comptageLigne} key={m.cle}>
                <span className={styles.comptageMatiere}>{nomMatiere(t, m.cle)}</span>
                <span className={styles.comptageTheorique}>—</span>
                <span className={styles.comptageSaisie}>
                  <input
                    className={styles.comptage}
                    ref={(element) => {
                      champs.current[m.cle] = element;
                    }}
                    value={texte}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={t('atelier.stocks.inventaires.comptage', {
                      matiere: nomMatiere(t, m.cle),
                    })}
                    onChange={(e) =>
                      onBrouillon({ ...brouillon, [m.cle]: e.target.value.replace(/[^\d.,]/g, '') })
                    }
                  />
                  <span className={styles.comptageUnite}>{unite}</span>
                </span>
                {/* Comptage à l'aveugle (O13) : ni stock théorique ni écart avant l'envoi, pas même par la couleur. */}
                <span className={styles.comptageEcart}>—</span>
              </div>
            );
          })}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaire} onClick={() => onBrouillon(null)}>
              {t('atelier.stocks.inventaires.annuler')}
            </button>
            <button type="submit" className={styles.principal} disabled={enregistrement}>
              {t('atelier.stocks.inventaires.soumettre')}
            </button>
          </div>
        </form>
      )}

      <section className={styles.carte} aria-labelledby="titre-historique-stock">
        <h2 className={styles.historiqueTitre} id="titre-historique-stock">
          {t('atelier.stocks.inventaires.historique')}
        </h2>
        <ul className={styles.lignes}>
          {[...inventaires].reverse().map((a) => (
            <li className={styles.audit} key={a.id}>
              <Mot niveau={NIVEAU_INVENTAIRE[a.statut]}>
                {t(`atelier.stocks.inventaires.statuts.${a.statut}`)}
              </Mot>
              <div className={styles.auditTexte}>
                <div className={styles.auditTitre}>
                  {a.id} · {`${jourCourt(a.jour, langue)} · ${a.heure}`}
                </div>
                <div className={styles.auditPar}>
                  {t('atelier.stocks.inventaires.comptePar', { nom: a.par }) +
                    (a.validePar
                      ? t('atelier.stocks.inventaires.validePar', { nom: a.validePar })
                      : '')}
                </div>
                <div className={styles.auditResume}>
                  {t('atelier.stocks.inventaires.resume', {
                    nombre: lignesEnEcart(a).length,
                    liste: resumeDesEcarts(t, lignesEnEcart(a), langue),
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
