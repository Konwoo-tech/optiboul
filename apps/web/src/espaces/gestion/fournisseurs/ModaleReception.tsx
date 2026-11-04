import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useRef, useState } from 'react';

import { jourCourt, nomMatiere, quantite, uniteMatiere } from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { filtrerQuantite, quantiteSaisie } from './regles.ts';
import type { Commande, Fournisseur } from './types.ts';

type Props = {
  commande: Commande;
  fournisseur: Fournisseur | undefined;
  enCours: boolean;
  onFermer: () => void;
  /** Quantité réellement livrée (déjà lue, strictement positive) et observation. */
  onConfirmer: (quantite: number, observation: string) => void;
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
  const champ = useRef<HTMLInputElement>(null);

  const valider = () => {
    const valeur = quantiteSaisie(quantiteTexte);
    if (!valeur) {
      setInvalide(true);
      onIncomplet();
      champ.current?.focus();
      return;
    }
    onConfirmer(valeur, observation.trim());
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
          onChange={(e) => {
            setQuantiteTexte(filtrerQuantite(e.target.value));
            setInvalide(false);
          }}
        />
      </label>
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
        <button type="button" className={styles.confirmer} disabled={enCours} onClick={valider}>
          {t('gestion.fournisseurs.reception.valider')}
        </button>
      </div>
    </FenetreModale>
  );
}
