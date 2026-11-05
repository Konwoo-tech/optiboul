import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { Carte, EcranChargement, EcranErreur } from '@/ui';
import { formaterDateCourte } from '@/utils';
import { Text } from '@mantine/core';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { codeErreur, useJournal } from './api.ts';
import styles from './Journal.module.css';
import { horodatage, peutVoirJournal } from './regles.ts';

/**
 * Gestion › Journal des actions (US-024) : toutes les actions avec auteur, profil et heure, les
 * plus récentes d'abord (les 40 dernières, comme la maquette). Lecture seule : le journal n'est
 * pas modifiable. Gérant, propriétaire et administrateur le voient (cahier des charges §3.3).
 */
export default function EcranJournal({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const { utilisateur, chargement, injoignable, reessayer } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useJournal(peutVoirJournal(profil) ? nom : undefined);

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

  const jourCourt = (jour: string) =>
    formaterDateCourte(new Date(`${jour}T12:00:00Z`), i18n.language);

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <section className={styles.carte} aria-labelledby="titre-journal">
        <h2 id="titre-journal" className={styles.titre}>
          {t('gestion.journal.titre')}
        </h2>
        {instantane.entrees.length === 0 ? (
          <p className={styles.vide}>{t('gestion.journal.vide')}</p>
        ) : (
          <ol className={styles.liste}>
            {instantane.entrees.map((entree) => (
              <li key={entree.id} className={styles.ligne}>
                <span className={styles.heure}>
                  {horodatage(entree, instantane.aujourdhui, jourCourt)}
                </span>
                {/* Un seul nœud de texte, comme la maquette : le crénage change à la jonction. */}
                <span className={styles.auteur}>
                  {entree.profil
                    ? `${entree.auteur} · ${t(`profils.${entree.profil}`)}`
                    : entree.auteur}
                </span>
                <span className={styles.quoi}>{entree.texte}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
