/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Tableaux en grille CSS (colonnes de la maquette, valeur par valeur) : passer à <table> changerait la mise en page au pixel près ; les rôles ARIA table, row et cell portent la sémantique. */
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { Link } from 'react-router';

import { libelleProduit } from './affichage.ts';
import styles from './Production.module.css';
import { besoinEnFarine, bornerSupplement, supplementEnDemande, totalSacs } from './regles.ts';
import {
  CLES_PRODUIT,
  MOTIFS_SUPPLEMENT,
  type CleProduit,
  type InstantaneProduction,
  type MotifSupplement,
  type Quantites,
} from './types.ts';

/** Fiche technique de chaque produit du plan. */
const FICHE_DU_PRODUIT: Record<CleProduit, string> = { BAG: 'bag', KO: 'ko', GC: 'gc135' };

type Props = {
  instantane: InstantaneProduction;
  /** Le responsable de la semaine peut ajuster les quantités. */
  peutAjuster: boolean;
  supplement: Quantites;
  motif: MotifSupplement | '';
  occupe: boolean;
  /** Chemin des commandes de la session, pour qui voit cet écran ; `null` sinon. */
  cheminCommandes: string | null;
  onSupplement: (produit: CleProduit, pas: number) => void;
  onMotif: (motif: MotifSupplement) => void;
  onReprendreSuggestion: () => void;
  onAjouter: () => void;
  /** Adresse de la fiche technique d'un produit. */
  cheminFiche: (fiche: string) => string;
};

/**
 * Onglet « Plan » : d'où vient la demande, ajustement du plan (supplément avec motif), puis le
 * plan lui-même, produit par produit, et son total.
 */
export function PanneauPlan({
  instantane,
  peutAjuster,
  supplement,
  motif,
  occupe,
  cheminCommandes,
  onSupplement,
  onMotif,
  onReprendreSuggestion,
  onAjouter,
  cheminFiche,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { plan, demande, etape, stock, demandeEnAttente } = instantane;
  const tp = (cle: string, options?: Record<string, unknown>) =>
    t(`atelier.production.plan.${cle}`, options);

  const enDemande = supplementEnDemande(etape);
  const cloturee = etape === 'cloturee';
  const saisis = totalSacs(supplement);
  const habituels = CLES_PRODUIT.reduce((somme, cle) => somme + demande[cle].habituels, 0);
  const guichet = CLES_PRODUIT.reduce((somme, cle) => somme + demande[cle].guichet, 0);
  const commandes = CLES_PRODUIT.reduce((somme, cle) => somme + demande[cle].commande, 0);
  const suggestion = CLES_PRODUIT.reduce((somme, cle) => somme + demande[cle].besoin, 0);
  const besoin = besoinEnFarine(plan, supplement);
  const farine = stock.farine;
  const arrondi = (valeur: number) =>
    String(Math.round(valeur * 100) / 100).replace('.', langue === 'en' ? '.' : ',');

  return (
    <>
      <section className={`${styles.carte} ${styles.carteSaisie}`} aria-labelledby="titre-origine">
        <div className={styles.titreGroupe}>
          <h2 className={styles.titre} id="titre-origine">
            {tp('origineTitre')}
          </h2>
          <div className={styles.sousTitreJoli}>{tp('origineSous')}</div>
        </div>
        <ol className={styles.sources}>
          <li className={styles.source}>
            <div className={styles.sourceHaut}>
              <span className={styles.sourceNumero}>1</span>
              <h3 className={styles.sourceNom}>{tp('sources.commandes')}</h3>
            </div>
            <span className={styles.sourceValeur}>
              {`${formaterNombre(commandes)} ${tp('pains')}`}
            </span>
            <span className={styles.sourceDetail}>{tp('sources.commandesDetail')}</span>
            {cheminCommandes && (
              <Link className={styles.lien} to={cheminCommandes}>
                {tp('sources.voirCommandes')}
              </Link>
            )}
          </li>
          <li className={styles.source}>
            <div className={styles.sourceHaut}>
              <span className={styles.sourceNumero}>2</span>
              <h3 className={styles.sourceNom}>{tp('sources.estimee')}</h3>
            </div>
            <span className={styles.sourceValeur}>
              {`+${formaterNombre(habituels + guichet)} ${tp('pains')}`}
            </span>
            <span className={styles.sourceDetail}>
              {tp('sources.estimeeDetail', {
                habituels: formaterNombre(habituels),
                guichet: formaterNombre(guichet),
              })}
            </span>
          </li>
          <li className={styles.source}>
            <div className={styles.sourceHaut}>
              <span className={styles.sourceNumero}>3</span>
              <h3 className={styles.sourceNom}>{tp('sources.supplement')}</h3>
            </div>
            <span className={styles.sourceValeur}>{`+${plan.supplement} ${tp('sacsCourt')}`}</span>
            <span className={styles.sourceDetail}>{tp('sources.supplementDetail')}</span>
          </li>
        </ol>
      </section>

      <section className={styles.carteTableau} aria-labelledby="titre-demande">
        <div className={styles.enteteTableau}>
          <div className={styles.enteteTexte}>
            <h2 className={styles.titre} id="titre-demande">
              {tp('demandeTitre')}
            </h2>
            <div className={styles.sousTitreJoli}>
              {peutAjuster
                ? tp(enDemande ? 'demandeSousDemande' : 'demandeSousAjout')
                : tp('demandeSousLecture')}
            </div>
          </div>
          {peutAjuster && suggestion > 0 && (
            <button type="button" className={styles.secondaire} onClick={onReprendreSuggestion}>
              {tp('reprendreSuggestion')}
            </button>
          )}
        </div>
        <div className={styles.defilement}>
          <div className={styles.tableau} role="table" aria-labelledby="titre-demande">
            <div className={`${styles.ligneTableau} ${styles.titresTableau}`} role="row">
              {(
                [
                  'produit',
                  'commande',
                  'habituels',
                  'guichet',
                  'estimee',
                  'prevu',
                  'suggestion',
                  'supplement',
                ] as const
              ).map((colonne) => (
                <span role="columnheader" key={colonne}>
                  {tp(`colonnes.${colonne}`)}
                </span>
              ))}
            </div>
            {CLES_PRODUIT.map((cle) => {
              const ligne = demande[cle];
              const saisi = supplement[cle];
              return (
                <div
                  className={`${styles.ligneTableau} ${styles.corpsTableau}`}
                  role="row"
                  key={cle}
                >
                  <span className={styles.produitTableau} role="rowheader">
                    {libelleProduit(cle)}
                  </span>
                  <span role="cell">{formaterNombre(ligne.commande)}</span>
                  <span role="cell">
                    {ligne.habituels ? `+${formaterNombre(ligne.habituels)}` : '—'}
                  </span>
                  <span role="cell">{`+${formaterNombre(ligne.guichet)}`}</span>
                  <span className={styles.gras} role="cell">
                    {formaterNombre(ligne.estimee)}
                  </span>
                  <span role="cell">
                    {`${formaterNombre(ligne.prevus)} · ${ligne.sacs} ${tp(ligne.sacs > 1 ? 'sacs' : 'sac')}`}
                  </span>
                  <span
                    className={styles.gras}
                    role="cell"
                    style={{
                      color: `var(--ob-${ligne.besoin ? 'surveiller' : 'ok'}-texte)`,
                    }}
                  >
                    {ligne.besoin ? `+${ligne.besoin} ${tp('sacsCourt')}` : tp('couvert')}
                  </span>
                  {peutAjuster ? (
                    <span className={styles.pas} role="cell">
                      <button
                        type="button"
                        className={styles.bouton}
                        aria-label={tp('moins', { produit: libelleProduit(cle) })}
                        disabled={saisi <= 0}
                        onClick={() => onSupplement(cle, -1)}
                      >
                        −
                      </button>
                      <output
                        className={styles.valeurPas}
                        aria-label={tp('supplementDe', { produit: libelleProduit(cle) })}
                      >
                        {saisi ? `+${saisi}` : '0'}
                      </output>
                      <button
                        type="button"
                        id={`supplement-plus-${cle}`}
                        className={styles.bouton}
                        aria-label={tp('plus', { produit: libelleProduit(cle) })}
                        disabled={bornerSupplement(saisi + 1) === saisi}
                        onClick={() => onSupplement(cle, 1)}
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <span className={styles.gras} role="cell">
                      {ligne.supplement ? `+${ligne.supplement} ${tp('sacsCourt')}` : '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {peutAjuster && (
          <div className={styles.pied}>
            <p className={styles.libellePied} id="libelle-motif">
              {tp('motifLibelle')}
            </p>
            <div className={styles.puces} role="group" aria-labelledby="libelle-motif">
              {MOTIFS_SUPPLEMENT.map((m) => (
                <button
                  type="button"
                  key={m}
                  id={`supplement-motif-${m}`}
                  className={`${styles.puce} ${motif === m ? styles.puceActive : ''}`}
                  aria-pressed={motif === m}
                  onClick={() => onMotif(m)}
                >
                  {tp(`motifs.${m}`)}
                </button>
              ))}
            </div>
            <div className={styles.actionPied}>
              <span
                className={`${styles.farine} ${besoin > farine ? styles.farineInsuffisante : ''}`}
              >
                {tp('farine', { stock: arrondi(farine), besoin })}
              </span>
              <button
                type="button"
                className={styles.principal}
                disabled={occupe}
                onClick={onAjouter}
              >
                {enDemande
                  ? tp('demanderAuGerant', { sacs: saisis })
                  : tp('ajouterAuPlan', { sacs: saisis })}
              </button>
            </div>
          </div>
        )}
        {(demandeEnAttente || cloturee) && (
          <p className={styles.note}>
            {demandeEnAttente
              ? tp('demandeEnAttente', {
                  total: demandeEnAttente.total,
                  produits: CLES_PRODUIT.filter((c) => demandeEnAttente.supplement[c] > 0)
                    .map(
                      (c) =>
                        `${libelleProduit(c)} +${demandeEnAttente.supplement[c]} ${tp('sacsCourt')}`,
                    )
                    .join(' · '),
                  motif: tp(`motifs.${demandeEnAttente.motif}`).toLocaleLowerCase(),
                  gerant: instantane.gerant,
                })
              : tp('cloturee')}
          </p>
        )}
      </section>

      <ul className={styles.cartes} aria-label={tp('cartesTitre')}>
        {CLES_PRODUIT.map((cle) => {
          const ligne = plan.lignes[cle];
          return (
            <li className={styles.cartePlan} key={cle}>
              <div className={styles.cartePlanHaut}>
                <h3 className={styles.cartePlanCode}>{libelleProduit(cle)}</h3>
                <span className={styles.cartePlanNom}>
                  {t(`atelier.production.produits.${cle}`)}
                </span>
              </div>
              <div className={styles.aPetrir}>{tp('aPetrir')}</div>
              <div className={styles.sacsGeants}>{String(ligne.sacs)}</div>
              <div className={styles.uniteSacs}>{tp('sacsDe50')}</div>
              <div className={styles.ligneCarte}>
                <span className={styles.ligneCarteLibelle}>{tp('commandes')}</span>
                <span className={styles.ligneCarteValeur}>{formaterNombre(ligne.pains)}</span>
              </div>
              <div className={styles.ligneCarte}>
                <span className={styles.ligneCarteLibelle}>{tp('prevus')}</span>
                <span className={styles.ligneCarteValeur}>{formaterNombre(ligne.prevus)}</span>
              </div>
              {ligne.supplement > 0 && (
                <div className={styles.ligneCarte}>
                  <span className={styles.ligneCarteLibelle}>{tp('dontSupplement')}</span>
                  <span className={`${styles.ligneCarteValeur} ${styles.ligneCarteSupplement}`}>
                    {`+${ligne.supplement} ${tp('sacsCourt')}`}
                  </span>
                </div>
              )}
              <div className={styles.ligneCarte}>
                <span className={styles.ligneCarteLibelle}>{tp('boules')}</span>
                <span className={styles.ligneCarteValeur}>{formaterNombre(ligne.boules)}</span>
              </div>
              <Link className={styles.ficheLien} to={cheminFiche(FICHE_DU_PRODUIT[cle])}>
                {tp('fiche')}
              </Link>
            </li>
          );
        })}
      </ul>

      <section className={styles.total} aria-label={tp('totalSession')}>
        <span className={styles.totalLibelle}>{tp('totalSession')}</span>
        <span className={styles.totalSacs}>
          {String(plan.sacs)} <span className={styles.uniteTotalGrande}>{tp('sacsDe50')}</span>
        </span>
        <span className={styles.totalSecondaire}>
          {`${formaterNombre(plan.sacs * 50)} kg`}{' '}
          <span className={styles.uniteTotal}>{tp('farineLibelle')}</span>
        </span>
        <span className={styles.totalSecondaire}>
          {formaterNombre(plan.prevus)} <span className={styles.uniteTotal}>{tp('prevus')}</span>
        </span>
      </section>
    </>
  );
}
