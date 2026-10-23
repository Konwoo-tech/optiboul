import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { jourComplet } from './affichage.ts';
import styles from './Production.module.css';
import { ecartAJustifier, limiteEcartKg, pourcentDEcart, unChiffre } from './regles.ts';
import type { InstantaneProduction, LigneHistorique } from './types.ts';

const COLONNES = [
  'jour',
  'session',
  'responsable',
  'validePar',
  'ouverture',
  'cloture',
  'sacs',
  'prevu',
  'realise',
  'ecart',
  'ecartMatieres',
  'statut',
] as const;

type Mot = 'ok' | 'surveiller' | 'bloquant';

type Ligne = {
  cle: string;
  jour: string;
  type: string;
  responsable: string;
  validePar: string;
  ouverture: string;
  cloture: string;
  sacs: string;
  prevu: string;
  realise: string;
  ecart: string;
  kg: string;
  couleurKg: string;
  niveau: Mot;
  mot: string;
  note: string;
};

/**
 * Productions rattachées aux semaines : la production en cours d'abord, puis les clôturées (et
 * les « non clôturées » archivées), plus récentes d'abord.
 */
export function Historique({ instantane }: { instantane: InstantaneProduction }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const { etape, session, plan, planValide, ouverte, responsable, seuilEcartKg } = instantane;
  const nomDuType = (type: LigneHistorique['type']) => t(`creneau.${type}Court`);

  const enCours: Ligne[] = ['plan-propose', 'plan-valide', 'en-cours'].includes(etape)
    ? [
        {
          cle: 'en-cours',
          jour: jourComplet(session.date, langue),
          type: nomDuType(session.type),
          responsable,
          validePar: planValide?.par ?? '—',
          ouverture: ouverte?.a ?? '—',
          cloture: '—',
          sacs: String(plan.sacs),
          prevu: formaterNombre(plan.prevus),
          realise: '—',
          ecart: '—',
          kg: '—',
          couleurKg: 'var(--ob-discret)',
          niveau: 'surveiller',
          mot: t('atelier.production.historique.statuts.en-cours'),
          note: '',
        },
      ]
    : [];

  const archivees: Ligne[] = [...instantane.historique].reverse().map((ligne) => {
    const ecart = ligne.realise === null ? 0 : pourcentDEcart(ligne.realise - ligne.prevus, ligne.prevus);
    return {
      cle: ligne.id,
      jour: jourComplet(ligne.date, langue),
      type: nomDuType(ligne.type),
      responsable: ligne.responsable,
      validePar: ligne.validePar,
      ouverture: ligne.ouvertA,
      cloture: ligne.clotureA,
      sacs: String(ligne.sacs),
      prevu: formaterNombre(ligne.prevus),
      realise: ligne.realise ? formaterNombre(ligne.realise) : '—',
      ecart: ligne.realise ? `${ecart > 0 ? '+' : ''}${unChiffre(ecart, langue)} %` : '—',
      // Comme la maquette : le nombre brut, sans mise en forme (« 3.1 kg », « 5 kg »).
      kg: `${ligne.ecartKg} kg`,
      couleurKg: ecartAJustifier(ligne.ecartKg, limiteEcartKg(seuilEcartKg, ligne.sacs))
        ? 'var(--ob-bloquant-texte)'
        : 'var(--ob-encre)',
      niveau: ligne.statut === 'cloturee' ? 'ok' : 'bloquant',
      mot: t(`atelier.production.historique.statuts.${ligne.statut}`),
      note: ligne.motif
        ? t(`atelier.production.consommation.motifs.${ligne.motif}`)
        : (ligne.note ?? ''),
    };
  });

  return (
    <section className={styles.historique} aria-labelledby="titre-historique">
      <div className={styles.historiqueCorps}>
        <h2 className={styles.historiqueTitre} id="titre-historique">
          {t('atelier.production.historique.titre')}
        </h2>
        <div role="table" aria-labelledby="titre-historique">
          <div className={`${styles.grilleHistorique} ${styles.titresHistorique}`} role="row">
            {COLONNES.map((colonne) => (
              <span role="columnheader" key={colonne}>
                {t(`atelier.production.historique.colonnes.${colonne}`)}
              </span>
            ))}
          </div>
          {[...enCours, ...archivees].map((ligne) => (
            <div className={styles.ligneHistorique} key={ligne.cle}>
              <div
                className={`${styles.grilleHistorique} ${styles.celluleHistorique}`}
                role="row"
              >
                <span style={{ fontWeight: 800 }} role="rowheader">
                  {ligne.jour}
                </span>
                <span role="cell">{ligne.type}</span>
                <span style={{ fontWeight: 700 }} role="cell">
                  {ligne.responsable}
                </span>
                <span role="cell">{ligne.validePar}</span>
                <span role="cell">{ligne.ouverture}</span>
                <span role="cell">{ligne.cloture}</span>
                <span role="cell">{ligne.sacs}</span>
                <span role="cell">{ligne.prevu}</span>
                <span role="cell">{ligne.realise}</span>
                <span role="cell">{ligne.ecart}</span>
                <span role="cell" style={{ fontWeight: 700, color: ligne.couleurKg }}>
                  {ligne.kg}
                </span>
                <span
                  className={`${styles.mot} ${styles.statutHistorique}`}
                  role="cell"
                  style={{
                    background: `var(--ob-${ligne.niveau}-fond)`,
                    color: `var(--ob-${ligne.niveau}-texte)`,
                  }}
                >
                  {ligne.mot}
                </span>
              </div>
              {ligne.note && <div className={styles.noteHistorique}>{ligne.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
