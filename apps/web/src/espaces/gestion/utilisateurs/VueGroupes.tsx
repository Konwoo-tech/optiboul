import { useTranslation } from '@/i18n';
import { useId, useRef, useState } from 'react';

import type { Profil } from '../../../profils.ts';
import { Pastille } from './Pastille.tsx';
import {
  DESCRIPTION_DE_GROUPE_MAX,
  descriptionDuGroupe,
  membresDuGroupe,
  nomDeGroupePris,
  nomDeGroupeValide,
  NOM_DE_GROUPE_MAX,
  nomDuGroupe,
  PROFILS_DE_DROITS,
} from './regles.ts';
import styles from './Utilisateurs.module.css';
import type { Groupe, NouveauGroupe, Utilisateur } from './types.ts';

type Props = {
  groupes: Groupe[];
  utilisateurs: Utilisateur[];
  occupe: boolean;
  /** Absent tant que le formulaire de création n'est pas livré : le bouton reste sans action. */
  onAjouterMembre?: (groupe: string) => void;
  /**
   * Rien (`null`) : le groupe est créé et le formulaire se vide. Un texte : refus du serveur, à
   * afficher sous le champ (la saisie est gardée). Texte vide : refus déjà signalé ailleurs.
   */
  onCreer: (groupe: NouveauGroupe) => Promise<string | null>;
  /** Ouvre la fenêtre de modification du groupe. */
  onModifier?: (groupe: Groupe) => void;
  /** Demande la suppression d'un groupe vide et non protégé. */
  onSupprimer?: (groupe: Groupe) => void;
};

/** Onglet « Groupes » : une carte par groupe et le formulaire d'un nouveau groupe (US-021). */
export function VueGroupes({
  groupes,
  utilisateurs,
  occupe,
  onAjouterMembre,
  onCreer,
  onModifier,
  onSupprimer,
}: Props) {
  const { t, i18n } = useTranslation();
  const idErreur = useId();
  const [nom, setNom] = useState('');
  const [profil, setProfil] = useState<Profil>('caissier');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState('');
  const champNom = useRef<HTMLInputElement>(null);

  const creer = async () => {
    if (occupe) return;
    const refuser = (message: string) => {
      setErreur(message);
      champNom.current?.focus();
    };
    const nomRogne = nom.trim();
    if (!nomDeGroupeValide(nomRogne)) return refuser(t('gestion.utilisateurs.groupes.erreurNom'));
    if (nomDeGroupePris(nomRogne, groupes)) {
      return refuser(t('gestion.utilisateurs.groupes.erreurExiste'));
    }
    const refus = await onCreer({ nom: nomRogne, profil, description: description.trim() });
    if (refus === null) {
      setNom('');
      setProfil('caissier');
      setDescription('');
      setErreur('');
    } else if (refus) {
      refuser(refus);
    }
  };

  const nombreDeMembres = (n: number) =>
    t(n > 1 ? 'gestion.utilisateurs.groupes.membres' : 'gestion.utilisateurs.groupes.membre', {
      nombre: n,
    });

  return (
    <div className={styles.groupes}>
      {groupes.map((g) => {
        const membres = membresDuGroupe(utilisateurs, g.id);
        const nomLocalise = nomDuGroupe(g, i18n.language);
        return (
          <section key={g.id} className={styles.carteGroupe} aria-label={nomLocalise}>
            <div className={styles.groupeEntete}>
              <h2 className={styles.groupeNom}>{nomLocalise}</h2>
              <span className={`${styles.mot} ${styles.groupeProfil}`}>
                {t(`profils.${g.profil}`)}
              </span>
            </div>
            <div className={styles.groupeDescription}>
              {descriptionDuGroupe(g, i18n.language) ||
                t('gestion.utilisateurs.groupes.descriptionParDefaut', {
                  profil: t(`profils.${g.profil}`),
                })}
            </div>
            <div className={styles.groupeNombre}>{nombreDeMembres(membres.length)}</div>
            <ul className={styles.membres}>
              {membres.map((u) => (
                <li key={u.id} className={styles.membre}>
                  <Pastille nom={u.nom} profil={u.profil} className={styles.membrePastille} />
                  <span className={styles.membreNom}>{u.nom}</span>
                </li>
              ))}
              {membres.length === 0 && (
                <li className={styles.membreVide}>{t('gestion.utilisateurs.liste.aucunMembre')}</li>
              )}
            </ul>
            <button
              type="button"
              className={`${styles.petit} ${styles.ajouterMembre}`}
              aria-label={t('gestion.utilisateurs.groupes.ajouterMembreA', { nom: nomLocalise })}
              aria-disabled={onAjouterMembre ? undefined : true}
              onClick={() => onAjouterMembre?.(g.id)}
            >
              + {t('gestion.utilisateurs.groupes.ajouterMembre')}
            </button>
            {onModifier && (
              <button
                type="button"
                className={`${styles.petit} ${styles.ajouterMembre}`}
                aria-label={t('gestion.utilisateurs.groupes.modifierNom', { nom: nomLocalise })}
                onClick={() => onModifier(g)}
              >
                {t('gestion.utilisateurs.groupes.modifier.bouton')}
              </button>
            )}
            {onSupprimer && !g.protege && membres.length === 0 && (
              <button
                type="button"
                className={`${styles.petit} ${styles.ajouterMembre}`}
                aria-label={t('gestion.utilisateurs.groupes.supprimerNom', { nom: nomLocalise })}
                onClick={() => onSupprimer(g)}
              >
                {t('gestion.utilisateurs.groupes.supprimer.bouton')}
              </button>
            )}
          </section>
        );
      })}

      <form
        className={`${styles.carteGroupe} ${styles.carteGroupeNouveau}`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void creer();
        }}
      >
        <h2 className={styles.titreNouveauGroupe}>{t('gestion.utilisateurs.groupes.nouveau')}</h2>
        <label className={styles.etiquette}>
          {t('gestion.utilisateurs.groupes.nom')}
          <input
            ref={champNom}
            className={styles.champ}
            value={nom}
            maxLength={NOM_DE_GROUPE_MAX}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? idErreur : undefined}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur('');
            }}
          />
        </label>
        <label className={styles.etiquette}>
          {t('gestion.utilisateurs.groupes.profil')}
          <select
            className={styles.choixChamp}
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
        <label className={styles.etiquette}>
          {t('gestion.utilisateurs.groupes.description')}
          <input
            className={styles.champ}
            value={description}
            maxLength={DESCRIPTION_DE_GROUPE_MAX}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <span id={idErreur} className={styles.erreur} role={erreur ? 'alert' : undefined}>
          {erreur}
        </span>
        <button
          type="submit"
          className={`${styles.principal} ${styles.alignerDroite}`}
          disabled={occupe}
        >
          {t('gestion.utilisateurs.groupes.creer')}
        </button>
      </form>
    </div>
  );
}
