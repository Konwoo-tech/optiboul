import { useTranslation } from '@/i18n';
import { FenetreModale, useHorloge } from '@/ui';
import { formaterHeure } from '@/utils';
import { useState, type SubmitEvent } from 'react';

import { jourAvecSemaine } from './formats.ts';
import { FONDS_PROPOSE, nombreSaisi, ouvertureHorsPlanning } from './regles.ts';
import type { ProchaineOuverture } from './types.ts';
import styles from './Fenetres.module.css';

type Props = {
  prochaine: ProchaineOuverture;
  /** Personne connectée. */
  moi: { id: string; nom: string };
  /** « Semaine 42 · 12 oct. → 18 oct. », déjà formatée. */
  semaine: string;
  erreur: string | null;
  envoiEnCours: boolean;
  onConfirmer: (fonds: number) => void;
  onFermer: () => void;
};

/** « Ouvrir la caisse » : on compte le fonds de caisse, 20 000 FCFA proposés (US-040). */
export function FenetreOuverture({
  prochaine,
  moi,
  semaine,
  erreur,
  envoiEnCours,
  onConfirmer,
  onFermer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const heure = formaterHeure(useHorloge());
  const [fonds, setFonds] = useState(String(FONDS_PROPOSE));
  const session = t(prochaine.type === 'nuit' ? 'creneau.nuit' : 'creneau.jour');

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    onConfirmer(nombreSaisi(fonds));
  };

  return (
    <FenetreModale titre={t('comptoir.caisses.ouverture.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.creneau}>
          <div className={styles.creneauTitre}>
            {t('comptoir.caisses.ouverture.creneau', {
              session,
              jour: jourAvecSemaine(prochaine.jour, langue),
            })}
          </div>
          <div className={styles.discret}>{semaine}</div>
        </div>
        <div className={styles.planifiee}>
          {prochaine.planifiee
            ? t('comptoir.caisses.ouverture.planifiee', { nom: prochaine.planifiee.nom })
            : t('comptoir.caisses.ouverture.nonPlanifiee')}
        </div>
        {ouvertureHorsPlanning(prochaine.planifiee, moi.id) && (
          <div className={styles.alerte} role="note">
            {t('comptoir.caisses.ouverture.horsPlanning')}
          </div>
        )}
        <label className={styles.champ}>
          {t('comptoir.caisses.ouverture.fonds')}
          <input
            className={styles.montant}
            value={fonds}
            onChange={(e) => setFonds(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </label>
        <div className={styles.discret}>
          {t('comptoir.caisses.ouverture.par', { nom: moi.nom, heure })}
        </div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {erreur}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.caisses.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('comptoir.caisses.ouverture.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
