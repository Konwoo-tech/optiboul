import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { Carte, EcranChargement, EcranErreur } from '@/ui';
import { formaterDateCourte } from '@/utils';
import { Text, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { codeErreur, useJournal } from './api.ts';
import styles from './Journal.module.css';
import { texteDeValeur } from './mapping.ts';
import { erreurDeFiltre, filtreActif, horodatage, peutVoirJournal } from './regles.ts';
import {
  LIMITE_AFFICHEE,
  SANS_FILTRE,
  TYPES_ACTION,
  type FiltresJournal,
  type TypeAction,
} from './types.ts';

/**
 * Gestion › Journal des actions (US-024) : toutes les actions avec auteur, profil et heure, les
 * plus récentes d'abord (les 40 dernières, comme la maquette), filtrables par auteur, type et
 * période, avec les valeurs avant / après quand l'action modifie une donnée. Lecture seule : le
 * journal n'est pas modifiable. Gérant, propriétaire et administrateur le voient (cahier des
 * charges §3.3).
 */
export default function EcranJournal({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const { utilisateur, chargement, injoignable, reessayer } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const [filtres, setFiltres] = useState<FiltresJournal>(SANS_FILTRE);
  const erreurFiltre = erreurDeFiltre(filtres);
  // Aucun appel pour un profil refusé ni pour une période invalide.
  const requete = useJournal(nom, filtres, !erreurFiltre && peutVoirJournal(profil));

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    const interdit =
      (!chargement && !injoignable && !utilisateur) ||
      (Boolean(profil) &&
        (!peutVoirJournal(profil) || codeErreur(requete.error) === 'droit_insuffisant'));
    let contenu;
    if (interdit) {
      contenu = (
        <Carte role="alert">
          <Text>{t('gestion.journal.interdit')}</Text>
        </Carte>
      );
    } else if (requete.isError || injoignable) {
      contenu = (
        <EcranErreur
          titre={t('erreur.titre')}
          message={t('gestion.journal.erreurChargement')}
          libelleAction={t('erreur.reessayer')}
          onAction={() => (injoignable ? reessayer() : void requete.refetch())}
        />
      );
    } else {
      contenu = <EcranChargement />;
    }
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {contenu}
      </>
    );
  }

  const modifier = (changement: Partial<FiltresJournal>) =>
    setFiltres((actuel) => ({ ...actuel, ...changement }));
  const jourCourt = (jour: string) =>
    formaterDateCourte(new Date(`${jour}T12:00:00Z`), i18n.language);
  const idErreur = erreurFiltre ? 'erreur-filtres-journal' : undefined;

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      {/* Absent de la maquette (US-024) : masqué dans le banc visuel. */}
      <form
        className={styles.filtres}
        data-filtres-journal
        aria-label={t('gestion.journal.filtres.titre')}
        onSubmit={(e) => e.preventDefault()}
      >
        <label className={styles.etiquette}>
          {t('gestion.journal.filtres.auteur')}
          <select
            className={styles.champ}
            value={filtres.auteur}
            onChange={(e) => modifier({ auteur: e.target.value })}
          >
            <option value="">{t('gestion.journal.filtres.tous')}</option>
            {instantane.auteurs.map((auteur) => (
              <option key={auteur} value={auteur}>
                {auteur}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.etiquette}>
          {t('gestion.journal.filtres.type')}
          <select
            className={styles.champ}
            value={filtres.type}
            onChange={(e) => modifier({ type: e.target.value as TypeAction | '' })}
          >
            <option value="">{t('gestion.journal.filtres.tous')}</option>
            {TYPES_ACTION.map((type) => (
              <option key={type} value={type}>
                {t(`gestion.journal.types.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.etiquette}>
          {t('gestion.journal.filtres.du')}
          <input
            type="date"
            className={styles.champ}
            value={filtres.du}
            max={filtres.au || undefined}
            onChange={(e) => modifier({ du: e.target.value })}
            aria-invalid={Boolean(erreurFiltre)}
            aria-describedby={idErreur}
          />
        </label>
        <label className={styles.etiquette}>
          {t('gestion.journal.filtres.au')}
          <input
            type="date"
            className={styles.champ}
            value={filtres.au}
            min={filtres.du || undefined}
            onChange={(e) => modifier({ au: e.target.value })}
            aria-invalid={Boolean(erreurFiltre)}
            aria-describedby={idErreur}
          />
        </label>
        {filtreActif(filtres) ? (
          <button
            type="button"
            className={styles.reinitialiser}
            onClick={() => setFiltres(SANS_FILTRE)}
          >
            {t('gestion.journal.filtres.reinitialiser')}
          </button>
        ) : null}
        {erreurFiltre ? (
          <p id={idErreur} role="alert" className={styles.erreur}>
            {t(`gestion.journal.erreurs.${erreurFiltre}`)}
          </p>
        ) : null}
      </form>

      <section className={styles.carte} aria-labelledby="titre-journal">
        <h2 id="titre-journal" className={styles.titre}>
          {t('gestion.journal.titre')}
        </h2>
        {/* Une seule annonce courte quand les filtres changent, au lieu de lire toute la liste. */}
        <VisuallyHidden component="output">
          {t('gestion.journal.resultats', { count: instantane.total })}
        </VisuallyHidden>
        {instantane.entrees.length === 0 ? (
          <p className={styles.vide}>
            {t(filtreActif(filtres) ? 'gestion.journal.videFiltre' : 'gestion.journal.vide')}
          </p>
        ) : (
          <ol className={styles.liste}>
            {instantane.entrees.map((entree) => (
              <li key={entree.id} className={styles.ligne}>
                <span className={styles.heure}>
                  <VisuallyHidden component="span">
                    {t('gestion.journal.colonnes.heure')}
                  </VisuallyHidden>
                  {horodatage(entree, instantane.aujourdhui, jourCourt)}
                </span>
                {/* Un seul nœud de texte, comme la maquette : le crénage change à la jonction. */}
                <span className={styles.auteur}>
                  <VisuallyHidden component="span">
                    {t('gestion.journal.colonnes.auteur')}
                  </VisuallyHidden>
                  {entree.profil
                    ? `${entree.auteur} · ${t(`profils.${entree.profil}`)}`
                    : entree.auteur}
                </span>
                <span className={styles.quoi}>
                  <VisuallyHidden component="span">
                    {t('gestion.journal.colonnes.action')}
                  </VisuallyHidden>
                  {entree.texte}
                  {entree.avant !== undefined && entree.apres !== undefined ? (
                    <span className={styles.changement}>
                      {t('gestion.journal.changement', {
                        avant: texteDeValeur(entree.avant),
                        apres: texteDeValeur(entree.apres),
                      })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
        {instantane.total > LIMITE_AFFICHEE ? (
          <p className={styles.limite}>
            {t('gestion.journal.limite', { affichees: LIMITE_AFFICHEE, total: instantane.total })}
          </p>
        ) : null}
      </section>
    </>
  );
}
