import { useTranslation } from '@/i18n';
import { FenetreModale, useHorloge } from '@/ui';
import { formaterHeure, formaterNombre } from '@/utils';
import { useState, type SubmitEvent } from 'react';

import { COFFRE } from './api.ts';
import { montantProposeAuCoffre, nombreSaisi } from './regles.ts';
import type { DetailEspeces, Personne } from './types.ts';
import styles from './Fenetres.module.css';

type Props = {
  detail: DetailEspeces;
  plafond: number;
  receveurs: Personne[];
  erreur: string | null;
  envoiEnCours: boolean;
  onConfirmer: (montant: number, receveur: string) => void;
  onFermer: () => void;
};

/** Remise d'espèces au coffre au-delà du plafond : receveur et heure sont tracés (US-041). */
export function FenetreCoffre({
  detail,
  plafond,
  receveurs,
  erreur,
  envoiEnCours,
  onConfirmer,
  onFermer,
}: Props) {
  const { t } = useTranslation();
  const heure = formaterHeure(useHorloge());
  const [montant, setMontant] = useState(
    String(montantProposeAuCoffre(detail.attendu, detail.fonds)),
  );
  const [receveur, setReceveur] = useState(receveurs[0]?.id ?? '');
  const remis = nombreSaisi(montant);
  const valide = remis > 0 && remis <= detail.attendu && receveur !== '';

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (valide) onConfirmer(remis, receveur);
  };

  return (
    <FenetreModale titre={t('comptoir.caisses.coffre.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={envoyer}>
        <div className={styles.planifiee}>
          {t('comptoir.caisses.coffre.explication', {
            attendu: formaterNombre(detail.attendu),
            plafond: formaterNombre(plafond),
          })}
        </div>
        <label className={styles.champ}>
          {t('comptoir.caisses.coffre.montant')}
          <input
            className={`${styles.montant} ${!valide && montant !== '' ? styles.erreurChamp : ''}`}
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            aria-invalid={!valide ? true : undefined}
          />
        </label>
        <label className={styles.champ}>
          {t('comptoir.caisses.coffre.receveur')}
          <select
            className={styles.texte}
            value={receveur}
            onChange={(e) => setReceveur(e.target.value)}
          >
            {receveurs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id === COFFRE ? t('comptoir.caisses.coffre.leCoffre') : r.nom}
              </option>
            ))}
          </select>
        </label>
        {valide ? (
          <div className={styles.discret}>
            {t('comptoir.caisses.coffre.reste', {
              montant: formaterNombre(detail.attendu - remis),
            })}
          </div>
        ) : (
          <div className={styles.erreur} role="alert">
            {t('comptoir.caisses.coffre.invalide')}
          </div>
        )}
        <div className={styles.discret}>{t('comptoir.caisses.coffre.trace', { heure })}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {erreur}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('comptoir.caisses.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={!valide || envoiEnCours}>
            {t('comptoir.caisses.coffre.confirmer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
