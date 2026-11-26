import { useTranslation } from '@/i18n';
import { FenetreModale, estTexteDuServeur, texteDuServeur } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import { saisirTelephone } from './regles.ts';
import type { Canal, Utilisateur } from './types.ts';

export type ModificationUtilisateur = { nom: string; telephone: string; canal: Canal };

type Props = {
  utilisateur: Utilisateur;
  envoiEnCours: boolean;
  /** Renvoie un code ou un texte d'erreur du serveur, ou `null` quand le compte est modifié. */
  onConfirmer: (modification: ModificationUtilisateur) => Promise<string | null>;
  onFermer: () => void;
};

const CANAUX: readonly Canal[] = ['whatsapp', 'sms'];

/** Corrige le nom, le téléphone et le canal du second facteur d'un compte (administrateur). */
export function ModaleUtilisateur({ utilisateur, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState(utilisateur.nom);
  const [telephone, setTelephone] = useState(utilisateur.telephone);
  const [canal, setCanal] = useState<Canal>(utilisateur.canal);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim()) return setErreur('nom_obligatoire');
    if (telephone.replace(/\D/g, '').length !== 9 || !telephone.trim().startsWith('6')) {
      return setErreur('telephone_invalide');
    }
    const refus = await onConfirmer({ nom: nom.trim(), telephone, canal });
    if (refus) setErreur(refus);
  };

  return (
    <FenetreModale titre={t('gestion.utilisateurs.modifier.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <div className={styles.discret}>{utilisateur.email}</div>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.modifier.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={60}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.modifier.telephone')}
          <input
            className={styles.texte}
            value={telephone}
            inputMode="tel"
            placeholder={t('gestion.utilisateurs.formulaire.telephoneExemple')}
            onChange={(e) => {
              setTelephone(saisirTelephone(e.target.value));
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.modifier.canal')}
          <select
            className={styles.texte}
            value={canal}
            onChange={(e) => setCanal(e.target.value as Canal)}
          >
            {CANAUX.map((c) => (
              <option key={c} value={c}>
                {t(`gestion.utilisateurs.modifier.canaux.${c}`)}
              </option>
            ))}
          </select>
        </label>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {estTexteDuServeur(erreur)
              ? texteDuServeur(erreur)
              : t(`gestion.utilisateurs.formulaire.erreurs.${erreur}`, {
                  defaultValue: t('gestion.utilisateurs.modifier.erreurDefaut'),
                })}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.utilisateurs.modifier.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.utilisateurs.modifier.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
