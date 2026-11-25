import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import type { Profil } from '../../../profils.ts';
import styles from '../../comptoir/caisses/Fenetres.module.css';
import {
  DESCRIPTION_DE_GROUPE_MAX,
  nomDeGroupePris,
  nomDeGroupeValide,
  NOM_DE_GROUPE_MAX,
  PROFILS_DE_DROITS,
} from './regles.ts';
import type { Groupe, NouveauGroupe } from './types.ts';

type Props = {
  groupe: Groupe;
  groupes: readonly Groupe[];
  envoiEnCours: boolean;
  /** Renvoie la clé du message d'erreur, ou `null` quand le groupe est modifié. */
  onConfirmer: (modification: NouveauGroupe) => Promise<string | null>;
  onFermer: () => void;
};

/** Modifier un groupe : nom, profil de droits et description (administrateur). */
export function ModaleGroupe({ groupe, groupes, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState(groupe.nom);
  const [profil, setProfil] = useState<Profil>(groupe.profil);
  const [description, setDescription] = useState(groupe.description);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const rogne = nom.trim();
    if (!nomDeGroupeValide(rogne)) return setErreur('nom');
    if (
      nomDeGroupePris(
        rogne,
        groupes.filter((g) => g.id !== groupe.id),
      )
    ) {
      return setErreur('existe');
    }
    const refus = await onConfirmer({ nom: rogne, profil, description: description.trim() });
    if (refus) setErreur(refus);
  };

  return (
    <FenetreModale titre={t('gestion.utilisateurs.groupes.modifierTitre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.groupes.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={NOM_DE_GROUPE_MAX}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.groupes.profil')}
          <select
            className={styles.texte}
            value={profil}
            onChange={(e) => setProfil(e.target.value as Profil)}
          >
            {PROFILS_DE_DROITS.map((p) => (
              <option key={p} value={p}>
                {t(`profils.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.champ}>
          {t('gestion.utilisateurs.groupes.description')}
          <input
            className={styles.texte}
            value={description}
            maxLength={DESCRIPTION_DE_GROUPE_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {t(`gestion.utilisateurs.groupes.modifier.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.utilisateurs.groupes.modifier.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.utilisateurs.groupes.modifier.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
