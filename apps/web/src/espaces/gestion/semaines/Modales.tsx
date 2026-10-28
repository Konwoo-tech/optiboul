import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';

import { jourMois } from './affichage.ts';
import { CRENEAUX_PAR_SEMAINE, creneauxAffectes } from './regles.ts';
import styles from './Semaines.module.css';
import { libelleSemaine } from './textes.ts';
import type { Planning, Semaine } from './types.ts';

type Commun = { semaine: Semaine; onFermer: () => void };

/** Dernier regard avant d'ouvrir la semaine : tout ce qui sera saisi lui sera rattaché (R1). */
export function ModaleOuverture({
  semaine,
  planning,
  nom,
  heure,
  enCours,
  onFermer,
  onConfirmer,
}: Commun & {
  planning: Planning;
  nom: string;
  heure: string;
  enCours: boolean;
  onConfirmer: () => void;
}) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const lignes = [
    [
      t('gestion.semaines.modales.ouvrir.periode'),
      `${jourMois(semaine.du, langue)} → ${jourMois(semaine.au, langue)}`,
    ],
    [t('gestion.semaines.modales.ouvrir.gerant'), semaine.gerant?.nom ?? '—'],
    [t('gestion.semaines.modales.ouvrir.production'), semaine.production?.nom ?? '—'],
    [
      t('gestion.semaines.modales.ouvrir.caisses'),
      `${creneauxAffectes(semaine, planning)} / ${CRENEAUX_PAR_SEMAINE}`,
    ],
    [
      t('gestion.semaines.modales.ouvrir.par'),
      t('gestion.semaines.modales.ouvrir.parValeur', { nom, heure }),
    ],
  ] as const;
  return (
    <FenetreModale
      titre={t('gestion.semaines.modales.ouvrir.titre', { numero: semaine.numero })}
      onFermer={onFermer}
    >
      <div className={styles.recap}>
        {lignes.map(([libelle, valeur]) => (
          <div className={styles.recapLigne} key={libelle}>
            <span className={styles.ligneLibelle}>{libelle}</span>
            <span className={styles.recapValeur}>{valeur}</span>
          </div>
        ))}
      </div>
      <div className={styles.noteModale}>{t('gestion.semaines.modales.ouvrir.note')}</div>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.semaines.modales.annuler')}
        </button>
        <button type="button" className={styles.confirmer} disabled={enCours} onClick={onConfirmer}>
          {t('gestion.semaines.modales.ouvrir.confirmer')}
        </button>
      </div>
    </FenetreModale>
  );
}

/** Confirmation de la clôture : le rapport de passation part au gérant de la semaine suivante. */
export function ModaleCloture({
  semaine,
  destinataire,
  enCours,
  onFermer,
  onConfirmer,
}: Commun & { destinataire: string; enCours: boolean; onConfirmer: () => void }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const libelle = libelleSemaine(t, semaine, langue);
  return (
    <FenetreModale titre={t('gestion.semaines.modales.cloturer.titre')} onFermer={onFermer}>
      <p className={styles.information}>
        {t('gestion.semaines.modales.cloturer.info', {
          // La maquette met la semaine en minuscules en français seulement.
          semaine: langue === 'en' ? libelle : libelle.toLowerCase(),
          nom: destinataire,
        })}
      </p>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.semaines.modales.annuler')}
        </button>
        <button type="button" className={styles.confirmer} disabled={enCours} onClick={onConfirmer}>
          {t('gestion.semaines.modales.cloturer.confirmer')}
        </button>
      </div>
    </FenetreModale>
  );
}
