import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { formaterNombre } from '@/utils';
import { useId, useRef, useState } from 'react';

import { jourCourt, nomMatiere, quantite, uniteMatiere } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { filtrerQuantite, QUANTITE_MAX, quantiteSaisie, quantiteTropGrande } from './regles.ts';
import type { Commande, Fournisseur } from './types.ts';

type Props = {
  commande: Commande;
  fournisseur: Fournisseur | undefined;
  enCours: boolean;
  onFermer: () => void;
  /** Quantité réellement livrée (déjà lue, strictement positive) et observation. */
  onConfirmer: (quantite: number, observation: string) => Promise<string | null>;
  /** La quantité saisie est illisible : l'écran l'annonce. */
  onIncomplet: () => void;
};

/** Comptage de la livraison : la quantité réellement livrée, une observation facultative (US-101). */
export function ModaleReception({
  commande,
  fournisseur,
  enCours,
  onFermer,
  onConfirmer,
  onIncomplet,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const [quantiteTexte, setQuantiteTexte] = useState(String(commande.commandee));
  const [observation, setObservation] = useState('');
  const [invalide, setInvalide] = useState(false);
  const [tropGrande, setTropGrande] = useState(false);
  const idErreur = useId();
  const champ = useRef<HTMLInputElement>(null);

  const valider = async () => {
    if (enCours) return;
    const valeur = quantiteSaisie(quantiteTexte);
    if (!valeur) {
      setInvalide(true);
      onIncomplet();
      champ.current?.focus();
      return;
    }
    const refus = quantiteTropGrande(valeur)
      ? 'quantite_trop_grande'
      : await onConfirmer(valeur, observation.trim());
    if (refus) {
      // La saisie est gardée : l'erreur est sur le champ.
      setInvalide(true);
      setTropGrande(true);
      champ.current?.focus();
    }
  };

  return (
    <FenetreModale
      titre={t('gestion.fournisseurs.reception.titre', { numero: commande.numero })}
      onFermer={onFermer}
    >
      <p className={styles.recapModale}>
        {t('gestion.fournisseurs.reception.ligne', {
          fournisseur: fournisseur?.nom ?? '',
          matiere: nomMatiere(t, commande.matiere),
          quantite: quantite(commande.commandee, langue),
          unite: uniteMatiere(t, commande.matiere),
          date: jourCourt(commande.jour, langue),
        })}
      </p>
      <label className={styles.etiquette}>
        {t('gestion.fournisseurs.reception.quantite')}
        <input
          className={styles.comptage}
          ref={champ}
          value={quantiteTexte}
          inputMode="decimal"
          aria-invalid={invalide}
          aria-describedby={tropGrande ? idErreur : undefined}
          onChange={(e) => {
            setQuantiteTexte(filtrerQuantite(e.target.value));
            setInvalide(false);
            setTropGrande(false);
          }}
        />
      </label>
      {tropGrande && (
        <span className={styles.erreurModale} id={idErreur} role="alert">
          {t('gestion.fournisseurs.reception.erreurs.quantite_trop_grande', {
            max: formaterNombre(QUANTITE_MAX),
          })}
        </span>
      )}
      <label className={styles.etiquette}>
        {t('gestion.fournisseurs.reception.observation')}
        <input
          className={styles.champ}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
        />
      </label>
      <p className={styles.aide}>{t('gestion.fournisseurs.reception.aide')}</p>
      <div className={styles.boutons}>
        <button type="button" className={styles.annuler} onClick={onFermer}>
          {t('gestion.fournisseurs.reception.annuler')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          aria-disabled={enCours}
          onClick={() => void valider()}
        >
          {t('gestion.fournisseurs.reception.valider')}
        </button>
      </div>
    </FenetreModale>
  );
}
