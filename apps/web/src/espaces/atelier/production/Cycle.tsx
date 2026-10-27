/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Tableaux en grille CSS (colonnes de la maquette, valeur par valeur) : passer à <table> changerait la mise en page au pixel près ; les rôles ARIA table, row et cell portent la sémantique. */
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';

import { dateCourte, nomDeSessionCourt } from './affichage.ts';
import styles from './Production.module.css';
import { etatsDesEtapes, type ActionCycle } from './regles.ts';
import type { InstantaneProduction } from './types.ts';

type Props = {
  instantane: InstantaneProduction;
  action: ActionCycle | null;
  occupe: boolean;
  onAction: (action: ActionCycle) => void;
};

/** Le cycle de la session : cinq étapes, avec l'action de l'étape pour qui y a droit. */
export function Cycle({ instantane, action, occupe, onAction }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const { session, semaine, responsable, gerant, etape } = instantane;
  const nuit = session.type === 'nuit';
  const etats = etatsDesEtapes(etape);
  const dateJour = dateCourte(session.date, langue);
  const sacs = instantane.plan.sacs;

  const tRoute = (cle: string, options?: Record<string, unknown>) =>
    t(`atelier.production.cycle.${cle}`, options);

  const etapes = [
    {
      cle: 'commandes',
      qui: tRoute('quiCommandes', { nom: instantane.caissiere }),
      quand: tRoute(nuit ? 'jusquaNuit' : 'jusquaJour'),
      detail: tRoute('detailCommandes', {
        clients: instantane.clientsCommandes,
        pains: formaterNombre(
          instantane.plan.lignes.BAG.pains +
            instantane.plan.lignes.KO.pains +
            instantane.plan.lignes.GC.pains,
        ),
      }),
    },
    {
      cle: 'planPropose',
      qui: tRoute('quiResponsable', { nom: responsable }),
      quand: instantane.planPropose
        ? tRoute('a', { heure: instantane.planPropose.a })
        : tRoute(nuit ? 'versPlanNuit' : 'versPlanJour'),
      detail: tRoute('detailPlan', { sacs }),
    },
    {
      cle: 'planValide',
      qui: tRoute('quiGerant', { nom: gerant }),
      quand: instantane.planValide
        ? `${tRoute('a', { heure: instantane.planValide.a })} · ${instantane.planValide.par}`
        : tRoute('avantPetrissage'),
      detail: '',
    },
    {
      cle: 'ouverte',
      qui: tRoute('quiResponsable', { nom: responsable }),
      quand: instantane.ouverte
        ? tRoute('aPetrissage', { heure: instantane.ouverte.a })
        : tRoute(nuit ? 'versOuvertureNuit' : 'versOuvertureJour'),
      detail: '',
    },
    {
      cle: 'cloturee',
      qui: tRoute('quiResponsable', { nom: responsable }),
      quand: instantane.cloturee
        ? tRoute('a', { heure: instantane.cloturee.a })
        : tRoute(nuit ? 'versClotureNuit' : 'versClotureJour'),
      detail: tRoute('detailCloture'),
    },
  ];

  let attente = '';
  if (!action) {
    attente =
      etape === 'commandes'
        ? tRoute('attentePlan', { nom: responsable })
        : etape === 'plan-propose'
          ? tRoute('attenteValidation', { nom: gerant })
          : etape === 'plan-valide'
            ? tRoute('attenteOuverture', { nom: responsable })
            : etape === 'en-cours'
              ? tRoute('attenteCloture', { nom: responsable })
              : tRoute('cloturePar', {
                  nom: instantane.cloturee?.par ?? '',
                  heure: instantane.cloturee?.a ?? '',
                });
  }

  return (
    <section className={`${styles.carte} ${styles.carteCycle}`} aria-labelledby="titre-cycle">
      <div className={styles.entete}>
        <div>
          <h2 className={styles.titre} id="titre-cycle">
            {tRoute('titre', { session: nomDeSessionCourt(t, session.type), date: dateJour })}
          </h2>
          <div className={styles.sousTitre}>
            {tRoute('sousTitre', {
              semaine: t('coque.semaine', {
                numero: semaine.numero,
                du: dateCourte(semaine.du, langue),
                au: dateCourte(semaine.au, langue),
              }),
              responsable,
              gerant,
            })}
          </div>
        </div>
        <div className={styles.actions}>
          {action && (
            <button
              type="button"
              className={styles.principal}
              disabled={occupe}
              onClick={() => onAction(action)}
            >
              {tRoute(`actions.${action}`, { sacs })}
            </button>
          )}
          {attente && <span className={styles.attente}>{attente}</span>}
        </div>
      </div>
      <ol className={styles.etapes} aria-label={tRoute('etapes')}>
        {etapes.map((e, i) => {
          const etat = etats[i];
          const faite = etat === 'faite';
          const courante = etat === 'courante';
          return (
            <li
              key={e.cle}
              className={`${styles.etape} ${faite ? styles.etapeFaite : ''} ${
                courante && !faite ? styles.etapeCourante : ''
              }`}
              aria-current={courante ? 'step' : undefined}
            >
              <div className={styles.etapeHaut}>
                <span
                  className={`${styles.pastilleEtape} ${
                    faite ? styles.pastilleFaite : courante ? styles.pastilleCourante : ''
                  }`}
                  aria-hidden
                >
                  {faite ? '✓' : String(i + 1)}
                </span>
                <span className={styles.etapeNom}>{tRoute(`noms.${e.cle}`)}</span>
              </div>
              <span className={styles.etapeQui}>{e.qui}</span>
              <span className={styles.etapeQuand}>{e.quand}</span>
              {e.detail && <span className={styles.etapeQuand}>{e.detail}</span>}
              <span className={styles.masque}>
                {tRoute(faite ? 'etatFaite' : courante ? 'etatCourante' : 'etatAVenir')}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.regle}>{tRoute('regle')}</p>
    </section>
  );
}
