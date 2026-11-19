import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';

export type NouvelEmploye = {
  nom: string;
  poste: string;
  telephone: string;
  /** Salaire de base mensuel, FCFA. */
  base: number;
};

type Props = {
  envoiEnCours: boolean;
  /** Renvoie le code d'erreur du serveur, ou `null` quand l'employé est créé. */
  onConfirmer: (employe: NouvelEmploye) => Promise<string | null>;
  onFermer: () => void;
};

/** Fiche d'un nouvel employé : nom, poste, téléphone et salaire de base (réservé au gérant). */
export function ModaleEmploye({ envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState('');
  const [poste, setPoste] = useState('');
  const [telephone, setTelephone] = useState('');
  const [base, setBase] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim() || !/^\d+$/.test(base) || Number(base) <= 0) {
      setErreur('obligatoire');
      return;
    }
    const refus = await onConfirmer({
      nom: nom.trim(),
      poste: poste.trim(),
      telephone: telephone.trim(),
      base: Number(base),
    });
    if (refus) setErreur('defaut');
  };

  return (
    <FenetreModale titre={t('gestion.personnel.employe.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('gestion.personnel.employe.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={120}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.personnel.employe.poste')}
          <input
            className={styles.texte}
            value={poste}
            maxLength={120}
            onChange={(e) => setPoste(e.target.value)}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.personnel.employe.telephone')}
          <input
            className={styles.texte}
            value={telephone}
            inputMode="tel"
            maxLength={30}
            onChange={(e) => setTelephone(e.target.value)}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.personnel.employe.base')}
          <input
            className={styles.texte}
            value={base}
            inputMode="numeric"
            onChange={(e) => {
              setBase(e.target.value.replace(/\D/g, ''));
              setErreur(null);
            }}
          />
        </label>
        <div className={styles.discret}>{t('gestion.personnel.employe.note')}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {t(`gestion.personnel.employe.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.personnel.employe.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.personnel.employe.creer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
