import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useId, useRef, useState } from 'react';

import type { Profil } from '../../../profils.ts';
import { uniteMatiere } from '../../atelier/stocks/affichage.ts';
import { dateCourte, libelleSession } from './affichage.ts';
import styles from './Depenses.module.css';
import {
  entierSaisi,
  erreurDeSaisie,
  quantiteSaisie,
  rattachementParDefaut,
  type ErreurSaisie,
} from './regles.ts';
import {
  CATEGORIES,
  MATIERES,
  MODES_DEPENSE,
  TYPES_RATTACHEMENT,
  type Categorie,
  type InstantaneDepenses,
  type Matiere,
  type ModeDepense,
  type NouvelleDepense,
  type TypeRattachement,
} from './types.ts';

type Props = {
  instantane: InstantaneDepenses;
  profil: Profil;
  nom: string;
  enregistrement: boolean;
  /** Code d'erreur renvoyé par le serveur pour la dernière saisie, s'il y en a un. */
  erreurServeur: string | null;
  onEnregistrer: (depense: NouvelleDepense) => Promise<boolean>;
  /** Appelé dès qu'on modifie un champ : l'erreur du serveur n'a plus lieu d'être affichée. */
  onModifier: () => void;
};

/** Saisie d'une dépense : catégorie, libellé, montant, rattachement, mode de paiement, justificatif. */
export function Formulaire({
  instantane,
  profil,
  nom,
  enregistrement,
  erreurServeur,
  onEnregistrer,
  onModifier,
}: Props) {
  const { t, i18n } = useTranslation();
  const idErreur = useId();
  const [categorie, setCategorie] = useState<Categorie>(CATEGORIES[0]);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [rattachement, setRattachement] = useState<TypeRattachement>(rattachementParDefaut(profil));
  const [matiere, setMatiere] = useState<Matiere>('levure');
  const [quantite, setQuantite] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [mode, setMode] = useState<ModeDepense>('caisse');
  const [photo, setPhoto] = useState(false);
  const [justificatif, setJustificatif] = useState<File | undefined>();
  const champFichier = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<ErreurSaisie | null>(null);
  const champLibelle = useRef<HTMLInputElement>(null);
  const champMontant = useRef<HTMLInputElement>(null);
  const champQuantite = useRef<HTMLInputElement>(null);

  /** Toute modification efface l'erreur affichée, qu'elle vienne de la saisie ou du serveur. */
  const effacer = () => {
    setErreur(null);
    onModifier();
  };

  const { semaineCourante, seuil, session } = instantane;
  const fournisseurs = instantane.fournisseurs.filter((f) => f.matieres.includes(matiere));
  const message = erreur
    ? t(`comptoir.depenses.erreurs.${erreur}`)
    : erreurServeur
      ? t(
          i18n.exists(`comptoir.depenses.erreurs.${erreurServeur}`)
            ? `comptoir.depenses.erreurs.${erreurServeur}`
            : 'comptoir.depenses.erreurs.defaut',
        )
      : '';

  const valider = async () => {
    const trouvee = erreurDeSaisie({ libelle, montant, rattachement, quantite });
    setErreur(trouvee);
    if (trouvee) {
      // Le focus va au premier champ fautif : le clavier reprend là où il faut corriger.
      const fautif = { libelle: champLibelle, montant: champMontant, quantite: champQuantite }[
        trouvee
      ];
      fautif.current?.focus();
      return;
    }
    const enregistree = await onEnregistrer({
      categorie,
      libelle: libelle.trim(),
      montant: entierSaisi(montant),
      mode,
      photo,
      ...(justificatif ? { justificatif } : {}),
      rattachement,
      ...(rattachement === 'stock'
        ? {
            matiere,
            quantite: quantiteSaisie(quantite),
            ...(fournisseur ? { fournisseur } : {}),
          }
        : {}),
    });
    if (enregistree) {
      setLibelle('');
      setMontant('');
      setQuantite('');
      setPhoto(false);
      setJustificatif(undefined);
    }
  };

  const puce = (actif: boolean) => `${styles.puce} ${actif ? styles.puceActive : ''}`;
  const unite = (cle: Matiere) => uniteMatiere(t, cle);

  return (
    <form
      className={styles.formulaire}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void valider();
      }}
    >
      <div>
        <h2 className={styles.titre}>{t('comptoir.depenses.formulaire.titre')}</h2>
        <div className={styles.qui}>
          {t('comptoir.depenses.formulaire.qui', {
            nom,
            role: t(`profils.${profil}`),
            semaine: t('coque.semaine', {
              numero: semaineCourante.numero,
              du: dateCourte(semaineCourante.du, i18n.language),
              au: dateCourte(semaineCourante.au, i18n.language),
            }),
          })}
        </div>
      </div>

      <label className={styles.etiquette}>
        {t('comptoir.depenses.formulaire.categorie')}
        <select
          className={styles.champ}
          value={categorie}
          onChange={(e) => {
            setCategorie(e.target.value as Categorie);
            effacer();
          }}
        >
          {CATEGORIES.map((cle) => (
            <option key={cle} value={cle}>
              {t(`comptoir.depenses.categories.${cle}`)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.etiquette}>
        {t('comptoir.depenses.formulaire.libelle')}
        <input
          className={styles.champ}
          ref={champLibelle}
          value={libelle}
          onChange={(e) => {
            setLibelle(e.target.value);
            effacer();
          }}
          aria-invalid={erreur === 'libelle'}
          aria-describedby={idErreur}
        />
      </label>

      <label className={styles.etiquette}>
        {t('comptoir.depenses.formulaire.montant')}
        <input
          className={`${styles.champ} ${styles.montant}`}
          ref={champMontant}
          value={montant}
          onChange={(e) => {
            setMontant(e.target.value.replace(/\D/g, ''));
            effacer();
          }}
          inputMode="numeric"
          aria-invalid={erreur === 'montant'}
          aria-describedby={idErreur}
        />
      </label>

      <fieldset className={styles.groupe}>
        <legend className={styles.libelle}>{t('comptoir.depenses.formulaire.rattacher')}</legend>
        <div className={styles.puces}>
          {TYPES_RATTACHEMENT.map((type) => (
            <button
              type="button"
              key={type}
              className={puce(rattachement === type)}
              aria-pressed={rattachement === type}
              onClick={() => {
                setRattachement(type);
                effacer();
              }}
            >
              {t(`comptoir.depenses.formulaire.rattachements.${type}`, {
                session: libelleSession(t, session, i18n.language),
                numero: semaineCourante.numero,
              })}
            </button>
          ))}
        </div>
      </fieldset>

      {rattachement === 'stock' && (
        <div className={styles.stock}>
          <label className={styles.etiquette}>
            {t('comptoir.depenses.formulaire.matiere')}
            <select
              className={styles.champ}
              value={matiere}
              onChange={(e) => {
                setMatiere(e.target.value as Matiere);
                setFournisseur('');
                effacer();
              }}
            >
              {MATIERES.map((cle) => (
                <option key={cle} value={cle}>
                  {`${t(`comptoir.depenses.matieres.${cle}.nom`)} (${unite(cle)})`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.etiquette}>
            {t('comptoir.depenses.formulaire.quantite')}
            <input
              className={styles.champ}
              ref={champQuantite}
              value={quantite}
              onChange={(e) => {
                setQuantite(e.target.value.replace(/[^\d.,]/g, ''));
                effacer();
              }}
              inputMode="decimal"
              aria-invalid={erreur === 'quantite'}
              aria-describedby={idErreur}
            />
          </label>
          <label className={styles.etiquette}>
            {t('comptoir.depenses.formulaire.fournisseur')}
            <select
              className={styles.champ}
              value={fournisseur}
              onChange={(e) => {
                setFournisseur(e.target.value);
                effacer();
              }}
            >
              <option value="">{t('comptoir.depenses.formulaire.marche')}</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <fieldset className={styles.groupe}>
        <legend className={styles.libelle}>{t('comptoir.depenses.formulaire.payePar')}</legend>
        <div className={styles.puces}>
          {MODES_DEPENSE.map((cle) => (
            <button
              type="button"
              key={cle}
              className={puce(mode === cle)}
              aria-pressed={mode === cle}
              onClick={() => {
                setMode(cle);
                effacer();
              }}
            >
              {t(`comptoir.depenses.modes.${cle}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className={`${styles.photo} ${photo ? styles.photoJointe : ''}`}
        aria-pressed={photo}
        onClick={() => {
          effacer();
          // La photo est un fichier : on ouvre l'appareil ou la galerie.
          if (photo) {
            setPhoto(!photo);
            setJustificatif(undefined);
          } else {
            champFichier.current?.click();
          }
        }}
      >
        {t(
          photo ? 'comptoir.depenses.formulaire.photoJointe' : 'comptoir.depenses.formulaire.photo',
        )}
      </button>

      <input
        ref={champFichier}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="justificatif"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) {
            setJustificatif(fichier);
            setPhoto(true);
          }
          e.target.value = '';
        }}
      />

      <div className={styles.note}>
        {t('comptoir.depenses.formulaire.note', { seuil: formaterNombre(seuil) })}
      </div>
      <span className={styles.erreur} id={idErreur} role={message ? 'alert' : undefined}>
        {message}
      </span>
      <button type="submit" className={styles.enregistrer} disabled={enregistrement}>
        {t('comptoir.depenses.formulaire.enregistrer')}
      </button>
    </form>
  );
}
