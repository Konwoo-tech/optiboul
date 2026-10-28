import { useTranslation } from '@/i18n';
import { formaterNombreSigne } from '@/utils';
import { useId } from 'react';

import { jourSemaine } from './affichage.ts';
import { Mot } from './Mot.tsx';
import {
  CRENEAUX_PAR_SEMAINE,
  creneauReel,
  creneauxAffectes,
  joursDeLaSemaine,
  niveauDeLEcart,
} from './regles.ts';
import styles from './Semaines.module.css';
import type { Creneau, CreneauReel, Personne, Planning, Semaine } from './types.ts';

type Props = {
  semaine: Semaine;
  planning: Planning;
  creneaux: readonly CreneauReel[];
  caissieres: readonly Personne[];
  modifiable: boolean;
  /** Une modification est en cours d'envoi : les listes attendent sa réponse. */
  occupe: boolean;
  onChoisir: (jour: string, creneau: Creneau, caissiere: string) => void;
};

type Cellule = {
  /** Liste de choix (créneau à planifier) ou nom en lecture seule. */
  modifiable: boolean;
  valeur: string;
  nom: string;
  sous: string;
  mot?: { niveau: 'ok' | 'bloquant' | 'surveiller'; texte: string };
};

function CelluleCreneau({
  libelle,
  cellule,
  nom,
  caissieres,
  occupe,
  onChoisir,
}: {
  libelle: string;
  occupe: boolean;
  cellule: Cellule;
  nom: string;
  caissieres: readonly Personne[];
  onChoisir: (caissiere: string) => void;
}) {
  const { t } = useTranslation();
  const idEtiquette = useId();
  return (
    <div className={styles.creneau}>
      <span className={styles.creneauEtiquette} id={idEtiquette}>
        {libelle}
      </span>
      {cellule.modifiable ? (
        <select
          className={styles.choix}
          aria-label={nom}
          aria-describedby={idEtiquette}
          value={cellule.valeur}
          disabled={occupe}
          onChange={(evenement) => onChoisir(evenement.target.value)}
        >
          <option value="">{t('gestion.semaines.planning.aAffecter')}</option>
          {caissieres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      ) : (
        <span className={styles.creneauNom}>{cellule.nom}</span>
      )}
      <div className={styles.creneauBas}>
        <span className={styles.creneauSous}>{cellule.sous}</span>
        {cellule.mot && <Mot niveau={cellule.mot.niveau}>{cellule.mot.texte}</Mot>}
      </div>
    </div>
  );
}

/** Planning des caisses : 7 jours × jour / nuit, une caissière par créneau (US-031). */
export function PlanningCaisses({
  semaine,
  planning,
  creneaux,
  caissieres,
  modifiable,
  occupe,
  onChoisir,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const jours = joursDeLaSemaine(semaine.du);
  const nomDe = (id: string) => caissieres.find((c) => c.id === id)?.nom ?? '';

  const cellule = (jour: string, type: Creneau): Cellule => {
    const reel = creneauReel(creneaux, jour, type);
    const prevue = planning[semaine.id]?.[jour]?.[type] ?? '';
    if (reel?.ecart != null) {
      const niveau = niveauDeLEcart(reel.ecart);
      return {
        modifiable: false,
        valeur: '',
        nom: reel.caissiere.nom,
        sous: t('gestion.semaines.planning.horaires', {
          ouverture: reel.ouverture,
          fermeture: reel.fermeture ?? '',
        }),
        mot: {
          niveau,
          texte:
            reel.ecart === 0
              ? t('gestion.semaines.planning.juste')
              : formaterNombreSigne(reel.ecart),
        },
      };
    }
    if (reel) {
      return {
        modifiable: false,
        valeur: '',
        nom: reel.caissiere.nom,
        sous: t('gestion.semaines.planning.ouverteA', { heure: reel.ouverture }),
        mot: { niveau: 'ok', texte: t('gestion.semaines.planning.enCours') },
      };
    }
    if (semaine.statut === 'cloturee') {
      return {
        modifiable: false,
        valeur: '',
        nom: nomDe(prevue) || '—',
        sous: t('gestion.semaines.planning.sous_fermee'),
      };
    }
    if (modifiable) {
      return {
        modifiable: true,
        valeur: prevue,
        nom: '',
        sous: prevue
          ? t('gestion.semaines.planning.sous_planifiee')
          : t('gestion.semaines.planning.sous_aAffecter'),
      };
    }
    return {
      modifiable: false,
      valeur: '',
      nom: nomDe(prevue) || t('gestion.semaines.planning.nonAffectee'),
      sous: t('gestion.semaines.planning.sous_planifiee'),
    };
  };

  return (
    <section className={`${styles.carte} ${styles.cartePlanning}`}>
      <div className={styles.entetePlanning}>
        <h2 className={styles.titreSection}>{t('gestion.semaines.planning.titre')}</h2>
        <span className={styles.sousTitre}>
          {t('gestion.semaines.planning.sous', {
            n: creneauxAffectes(semaine, planning),
            total: CRENEAUX_PAR_SEMAINE,
          })}
        </span>
      </div>
      <div className={styles.note}>
        {t(
          modifiable
            ? 'gestion.semaines.planning.noteModifiable'
            : 'gestion.semaines.planning.noteLecture',
        )}
      </div>
      {jours.map((jour) => (
        <div className={styles.jourPlanning} key={jour}>
          <div className={styles.jourNom}>{jourSemaine(jour, langue)}</div>
          {(['jour', 'nuit'] as const).map((type) => (
            <CelluleCreneau
              key={type}
              libelle={t(`creneau.${type}`)}
              nom={t('gestion.semaines.planning.libelleChamp', {
                jour: jourSemaine(jour, langue),
                creneau: t(`creneau.${type}`),
              })}
              cellule={cellule(jour, type)}
              caissieres={caissieres}
              occupe={occupe}
              onChoisir={(caissiere) => onChoisir(jour, type, caissiere)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
