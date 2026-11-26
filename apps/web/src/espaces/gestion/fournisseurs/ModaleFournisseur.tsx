import { useTranslation } from '@/i18n';
import { FenetreModale, estTexteDuServeur, texteDuServeur } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import { nomMatiere } from './affichage.ts';
import { CONDITIONS, MATIERES, type Conditions, type Fournisseur, type Matiere } from './types.ts';

export type SaisieFournisseur = {
  nom: string;
  telephone: string;
  conditions: Conditions;
  conditionsNote: string;
  matieres: Matiere[];
  actif: boolean;
};

type Props = {
  /** Fournisseur à modifier ; absent : un nouveau fournisseur. */
  fournisseur?: Fournisseur;
  envoiEnCours: boolean;
  /** Renvoie la clé du message d'erreur, ou `null` quand c'est enregistré. */
  onConfirmer: (saisie: SaisieFournisseur) => Promise<string | null>;
  onFermer: () => void;
};

/** Fiche d'un fournisseur : identité, conditions de paiement et matières livrées (gérant). */
export function ModaleFournisseur({ fournisseur, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState(fournisseur?.nom ?? '');
  const [telephone, setTelephone] = useState(fournisseur?.telephone ?? '');
  const [conditions, setConditions] = useState<Conditions>(
    fournisseur?.conditions ?? 'a-la-livraison',
  );
  const [conditionsNote, setConditionsNote] = useState(fournisseur?.conditionsNote ?? '');
  const [matieres, setMatieres] = useState<Matiere[]>([...(fournisseur?.matieres ?? [])]);
  const [actif, setActif] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim()) return setErreur('nom');
    if (matieres.length === 0) return setErreur('matieres');
    const refus = await onConfirmer({
      nom: nom.trim(),
      telephone: telephone.trim(),
      conditions,
      conditionsNote: conditionsNote.trim(),
      matieres,
      actif,
    });
    if (refus) setErreur(refus);
  };

  const basculer = (matiere: Matiere) => {
    setErreur(null);
    setMatieres((actuelles) =>
      actuelles.includes(matiere)
        ? actuelles.filter((m) => m !== matiere)
        : [...actuelles, matiere],
    );
  };

  return (
    <FenetreModale
      titre={t(
        fournisseur
          ? 'gestion.fournisseurs.fiche.titreModifier'
          : 'gestion.fournisseurs.fiche.titreNouveau',
      )}
      onFermer={onFermer}
    >
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('gestion.fournisseurs.fiche.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={150}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.fournisseurs.fiche.telephone')}
          <input
            className={styles.texte}
            value={telephone}
            inputMode="tel"
            maxLength={20}
            onChange={(e) => setTelephone(e.target.value)}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.fournisseurs.fiche.conditions')}
          <select
            className={styles.texte}
            value={conditions}
            onChange={(e) => setConditions(e.target.value as Conditions)}
          >
            {CONDITIONS.map((cle) => (
              <option key={cle} value={cle}>
                {t(`gestion.fournisseurs.fiches.conditionsValeurs.${cle}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.champ}>
          {t('gestion.fournisseurs.fiche.note')}
          <input
            className={styles.texte}
            value={conditionsNote}
            maxLength={255}
            onChange={(e) => setConditionsNote(e.target.value)}
          />
        </label>
        <fieldset className={styles.champ}>
          <legend>{t('gestion.fournisseurs.fiche.matieres')}</legend>
          {MATIERES.map((matiere) => (
            <label key={matiere}>
              <input
                type="checkbox"
                checked={matieres.includes(matiere)}
                onChange={() => basculer(matiere)}
              />{' '}
              {nomMatiere(t, matiere)}
            </label>
          ))}
        </fieldset>
        {fournisseur && (
          <label>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />{' '}
            {t('gestion.fournisseurs.fiche.actif')}
          </label>
        )}
        {erreur && (
          <div className={styles.erreur} role="alert">
            {estTexteDuServeur(erreur)
              ? texteDuServeur(erreur)
              : t(`gestion.fournisseurs.fiche.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.fournisseurs.fiche.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t(
              fournisseur
                ? 'gestion.fournisseurs.fiche.enregistrer'
                : 'gestion.fournisseurs.fiche.creer',
            )}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
