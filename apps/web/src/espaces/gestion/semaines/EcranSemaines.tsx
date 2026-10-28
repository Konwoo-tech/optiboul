import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { formaterHeure } from '@/utils';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { jourMois } from './affichage.ts';
import {
  codeErreur,
  useAffecter,
  useCloturerSemaine,
  useOuvrirSemaine,
  usePlanifier,
  useSemaines,
} from './api.ts';
import { CarteSemaine } from './CarteSemaine.tsx';
import { Chiffres } from './Chiffres.tsx';
import { Controles } from './Controles.tsx';
import { Historique } from './Historique.tsx';
import { ModaleCloture, ModaleOuverture } from './Modales.tsx';
import { PlanningCaisses } from './PlanningCaisses.tsx';
import { RapportPassation } from './RapportPassation.tsx';
import { niveauDuStatut, peutPlanifier, semaineCourante } from './regles.ts';
import styles from './Semaines.module.css';
import type { Creneau, RoleAffecte } from './types.ts';

type Fenetre = { type: 'ouvrir'; heure: string } | { type: 'cloturer' };

const PARAMETRE = 'semaine';

/**
 * Gestion › Semaines (US-030 à US-035) : le propriétaire planifie les semaines et affecte le
 * gérant et le responsable de production ; le gérant affecté (ou le propriétaire) ouvre la semaine,
 * planifie les caisses et la clôture avec le rapport de passation. Le responsable de production
 * consulte.
 */
export default function EcranSemaines({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useSemaines(nom);
  const affecter = useAffecter(nom);
  const planifier = usePlanifier(nom);
  const ouvrir = useOuvrirSemaine(nom);
  const cloturer = useCloturerSemaine(nom);
  const [parametres, setParametres] = useSearchParams();
  const [fenetre, setFenetre] = useState<Fenetre | null>(null);

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.semaines.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const { semaines, planning, creneaux } = instantane;
  const langue = i18n.language;
  const demandee = parametres.get(PARAMETRE);
  const choisie = semaines.find((s) => s.id === demandee) ?? semaineCourante(semaines);
  if (!choisie) return null;
  const cloture = instantane.clotures[choisie.id];

  const choisir = (id: string) =>
    setParametres(
      (actuels) => {
        const suivants = new URLSearchParams(actuels);
        suivants.set(PARAMETRE, id);
        return suivants;
      },
      { replace: true },
    );

  /** Un refus du serveur (règle ou droit) : l'écran se remet à jour et le dit. */
  const signaler = (erreur: unknown) => {
    const code = codeErreur(erreur);
    afficher(
      t(
        code === 'controles_bloquants'
          ? 'gestion.semaines.toasts.bloquants'
          : code === 'droit_insuffisant'
            ? 'gestion.semaines.toasts.droit'
            : code
              ? 'gestion.semaines.toasts.impossible'
              : 'gestion.semaines.toasts.erreur',
      ),
    );
    void requete.refetch();
  };

  const surAffecter = (role: RoleAffecte, personne: string) =>
    affecter.mutate({ semaine: choisie.id, role, personne }, { onError: signaler });

  const surPlanifier = (jour: string, creneau: Creneau, caissiere: string) =>
    planifier.mutate({ semaine: choisie.id, jour, creneau, caissiere }, { onError: signaler });

  const confirmerOuverture = () =>
    ouvrir.mutate(
      { semaine: choisie.id },
      {
        onSuccess: () => {
          setFenetre(null);
          afficher(t('gestion.semaines.toasts.ouverte', { numero: choisie.numero }));
        },
        onError: (erreur) => {
          setFenetre(null);
          signaler(erreur);
        },
      },
    );

  const destinataire = cloture?.passation.destinataire?.nom;
  const confirmerCloture = () =>
    cloturer.mutate(
      { semaine: choisie.id },
      {
        onSuccess: () => {
          setFenetre(null);
          afficher(
            destinataire
              ? t('gestion.semaines.toasts.clotureeAvecPassation', {
                  numero: choisie.numero,
                  nom: destinataire,
                })
              : t('gestion.semaines.toasts.cloturee', { numero: choisie.numero }),
          );
        },
        onError: (erreur) => {
          setFenetre(null);
          signaler(erreur);
        },
      },
    );

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <fieldset className={styles.puces}>
          <legend className={styles.invisible}>{t('gestion.semaines.sections')}</legend>
          {semaines.map((semaine) => (
            <button
              type="button"
              key={semaine.id}
              className={`${styles.puce} ${semaine.id === choisie.id ? styles.puceActive : ''}`}
              aria-pressed={semaine.id === choisie.id}
              onClick={() => choisir(semaine.id)}
            >
              <span className={styles.puceTitre}>
                {t('gestion.semaines.puce.titre', { numero: semaine.numero })}
              </span>
              <span
                className={styles.puceSous}
                style={{ color: `var(--ob-${niveauDuStatut(semaine.statut)}-texte)` }}
              >
                {t('gestion.semaines.puce.sous', {
                  statut: t(`gestion.semaines.statuts.${semaine.statut}`),
                  du: jourMois(semaine.du, langue),
                  au: jourMois(semaine.au, langue),
                })}
              </span>
            </button>
          ))}
        </fieldset>

        <div className={styles.rangee}>
          <CarteSemaine
            semaine={choisie}
            semaines={semaines}
            profil={profil}
            nom={nom}
            gerants={instantane.gerants}
            responsables={instantane.responsables}
            cloture={cloture}
            onAffecter={surAffecter}
            onOuvrir={() => setFenetre({ type: 'ouvrir', heure: formaterHeure(new Date()) })}
            onCloturer={() => setFenetre({ type: 'cloturer' })}
          />
          {instantane.indicateurs[choisie.id] && (
            <Chiffres
              semaine={choisie.id}
              indicateurs={instantane.indicateurs[choisie.id]!}
              profil={profil}
            />
          )}
        </div>

        <PlanningCaisses
          semaine={choisie}
          planning={planning}
          creneaux={creneaux}
          caissieres={instantane.caissieres}
          modifiable={peutPlanifier(profil, choisie, nom)}
          onChoisir={surPlanifier}
        />

        {choisie.statut === 'ouverte' && cloture && (
          <div className={`${styles.rangee} ${styles.rangeeHaute}`}>
            <Controles controles={cloture.controles} profil={profil} />
            <RapportPassation
              passation={cloture.passation}
              onExporter={() => afficher(t('gestion.semaines.passation.toastPdf'))}
            />
          </div>
        )}

        <Historique semaines={semaines} choisie={choisie.id} onChoisir={choisir} />
      </div>

      {fenetre?.type === 'ouvrir' && (
        <ModaleOuverture
          semaine={choisie}
          planning={planning}
          nom={nom}
          heure={fenetre.heure}
          enCours={ouvrir.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={confirmerOuverture}
        />
      )}
      {fenetre?.type === 'cloturer' && (
        <ModaleCloture
          semaine={choisie}
          destinataire={destinataire ?? '—'}
          enCours={cloturer.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={confirmerCloture}
        />
      )}
    </>
  );
}
