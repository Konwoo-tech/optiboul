import { useTranslation } from '@/i18n';
import { FenetreModale, estTexteDuServeur, texteDuServeur } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import type { ProduitParametre } from './types.ts';

export type SaisieProduit = {
  nom: string;
  nomEn: string;
  /** Prix de vente de base en FCFA ; `null` : aucun prix de base. */
  prix: number | null;
  /** Cuisson en minutes ; `null` : inconnue. */
  cuisson: number | null;
  actif: boolean;
};

type Props = {
  produit: ProduitParametre;
  envoiEnCours: boolean;
  /** Renvoie la clé du message d'erreur, ou `null` quand c'est enregistré. */
  onConfirmer: (saisie: SaisieProduit) => Promise<string | null>;
  onFermer: () => void;
};

const chiffres = (valeur: string) => valeur.replace(/\D/g, '');

/** Modification d'un produit : noms, prix de base, cuisson et présence au catalogue (propriétaire). */
export function ModaleProduit({ produit, envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState(produit.nom);
  const [nomEn, setNomEn] = useState(produit.nomEn);
  const [prix, setPrix] = useState(produit.prixBase === null ? '' : String(produit.prixBase));
  const [cuisson, setCuisson] = useState(
    produit.cuissonMinutes === null ? '' : String(produit.cuissonMinutes),
  );
  const [actif, setActif] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim()) return setErreur('nom');
    const refus = await onConfirmer({
      nom: nom.trim(),
      nomEn: nomEn.trim(),
      prix: prix === '' ? null : Number(prix),
      cuisson: cuisson === '' ? null : Number(cuisson),
      actif,
    });
    if (refus) setErreur(refus);
  };

  return (
    <FenetreModale
      titre={t('gestion.parametres.produits.modifierTitre', { code: produit.code })}
      onFermer={onFermer}
    >
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('gestion.parametres.produits.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={100}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.parametres.produits.nomEn')}
          <input
            className={styles.texte}
            value={nomEn}
            maxLength={100}
            onChange={(e) => setNomEn(e.target.value)}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.parametres.produits.prixBase')}
          <input
            className={styles.texte}
            value={prix}
            inputMode="numeric"
            onChange={(e) => setPrix(chiffres(e.target.value))}
          />
        </label>
        <div className={styles.discret}>{t('gestion.parametres.produits.noteTarifs')}</div>
        <label className={styles.champ}>
          {t('gestion.parametres.produits.cuisson')}
          <input
            className={styles.texte}
            value={cuisson}
            inputMode="numeric"
            onChange={(e) => setCuisson(chiffres(e.target.value))}
          />
        </label>
        <label>
          <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />{' '}
          {t('gestion.parametres.produits.actif')}
        </label>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {estTexteDuServeur(erreur)
              ? texteDuServeur(erreur)
              : t(`gestion.parametres.produits.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.parametres.produits.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.parametres.produits.enregistrer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
