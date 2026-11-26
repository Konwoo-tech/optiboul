import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast, afficherRefus, codeOuTexte } from '@/ui';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { formaterMois } from './affichage.ts';
import {
  codeErreur,
  useAjouterLigne,
  useModifierLigne,
  useChoisirLeJour,
  lireFicheEmploye,
  useAbsencesProposees,
  useCreerEmploye,
  useModifierEmploye,
  useDeciderLaPaie,
  usePayer,
  usePayerLesRestes,
  usePersonnel,
  usePreparer,
  usePlanifierLeMois,
  useModifierAjustement,
  useRetirerLigne,
  useSoumettre,
} from './api.ts';
import { CalendrierPaies } from './CalendrierPaies.tsx';
import { EtatDePaie } from './EtatDePaie.tsx';
import { FicheEmploye } from './FicheEmploye.tsx';
import { ModaleEmploye, type NouvelEmploye } from './ModaleEmploye.tsx';
import { ModaleLigne } from './ModaleLigne.tsx';
import styles from './Personnel.module.css';
import { droitsPaie, montantAPayer, calculerPaie, totaux } from './regles.ts';
import { TableauPaie } from './TableauPaie.tsx';
import type { Ajustement, ModePaiement, NouvelAjustement } from './types.ts';

const PARAMETRE = 'employe';

/**
 * Gestion › Personnel et paie (US-120 à US-124) : le gérant prépare l'état de paie du mois
 * (gains, pénalités, jour de paie), le soumet au propriétaire, qui le valide (ou le refuse, et il
 * revient en brouillon) ; le gérant paie ensuite, individuellement ou tous les restes, en partiel
 * au besoin. Données très sensibles : gérant et propriétaire seulement (cahier des charges §3.3).
 */
export default function EcranPersonnel({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = usePersonnel(nom);
  const ajouter = useAjouterLigne(nom);
  const retirer = useRetirerLigne(nom);
  const modifierAjustement = useModifierAjustement(nom);
  const [ligneEnEdition, setLigneEnEdition] = useState<Ajustement | null>(null);
  const modifierLigne = useModifierLigne(nom);
  const choisirLeJour = useChoisirLeJour(nom);
  const planifier = usePlanifierLeMois(nom);
  const soumettre = useSoumettre(nom);
  const preparer = usePreparer(nom);
  const creerEmploye = useCreerEmploye(nom);
  const absencesProposees = useAbsencesProposees(
    requete.data?.etat,
    profil === 'gerant' && requete.data?.statut === 'brouillon',
  );
  const [nouvelEmploye, setNouvelEmploye] = useState(false);
  const modifierEmploye = useModifierEmploye(nom);
  const [edition, setEdition] = useState<{ id: number; fiche: NouvelEmploye } | null>(null);
  const payer = usePayer(nom);
  const payerRestes = usePayerLesRestes(nom);
  const decider = useDeciderLaPaie(nom);
  const [parametres, setParametres] = useSearchParams();
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [montantPaye, setMontantPaye] = useState('');
  const [reference, setReference] = useState('');
  const [referenceManquante, setReferenceManquante] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  // Un paiement ne part qu'une fois : l'état « occupé » n'arrive qu'au rendu suivant, un second clic le précède.
  const paiementEnCours = useRef(false);

  const instantane = requete.data;
  // Sans état pour le mois, rien ne se modifie ni ne se paie : seule la préparation est proposée.
  const droitsDuProfil = droitsPaie(profil);
  const droits = instantane?.aPreparer
    ? { ...droitsDuProfil, soumettre: false, valider: false, payer: false }
    : droitsDuProfil;
  if (!instantane || !profil || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.personnel.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const occupe = [
    ajouter,
    retirer,
    modifierLigne,
    choisirLeJour,
    planifier,
    soumettre,
    preparer,
    payer,
    payerRestes,
    decider,
  ].some((m) => m.isPending);
  const { employes } = instantane;
  const choisi = employes.find((e) => e.id === parametres.get(PARAMETRE)) ?? employes[0];
  if (!choisi) return null;

  const choisir = (id: string) => {
    setMontantPaye('');
    setParametres(
      (actuels) => {
        const suivants = new URLSearchParams(actuels);
        suivants.set(PARAMETRE, id);
        return suivants;
      },
      { replace: true },
    );
  };

  /** Lit la fiche de l'employé sur le serveur, puis ouvre la fenêtre de modification. */
  const ouvrirLaFiche = async (id: number) => {
    try {
      setEdition({ id, fiche: await lireFicheEmploye(id) });
    } catch (erreur) {
      signaler(erreur);
    }
  };

  /** Un refus du serveur (règle ou droit) : l'écran se remet à jour et le dit. */
  const signaler = (erreur: unknown) => {
    const code = codeErreur(erreur);
    afficherRefus(
      afficher,
      t,
      erreur,
      code === 'droit_insuffisant'
        ? 'gestion.personnel.toasts.droit'
        : code === 'etat_verrouille'
          ? 'gestion.personnel.toasts.verrouille'
          : code === 'paiement_ferme'
            ? 'gestion.personnel.toasts.paiementFerme'
            : code
              ? 'gestion.personnel.toasts.impossible'
              : 'gestion.personnel.toasts.erreur',
    );
    void requete.refetch();
  };

  const surAjouter = (ligne: Omit<NouvelAjustement, 'employe'>) =>
    new Promise<boolean>((resoudre) =>
      ajouter.mutate(
        { ...ligne, employe: choisi.id },
        {
          onSuccess: () => resoudre(true),
          onError: (erreur) => {
            setErreurServeur(codeOuTexte(erreur, (c) => c === 'montant_invalide') ?? 'erreur');
            if (codeErreur(erreur) !== 'montant_invalide') signaler(erreur);
            resoudre(false);
          },
        },
      ),
    );

  /** R7 : le mobile money exige la référence de la transaction ; sinon on la demande dans la fiche. */
  const referenceRefusee = () => {
    if (mode !== 'mobile' || reference.trim()) return false;
    setReferenceManquante(true);
    afficher(t('gestion.personnel.toasts.reference'));
    return true;
  };

  const surPayer = () => {
    if (referenceRefusee()) return;
    const { reste } = calculerPaie(choisi);
    const montant = montantAPayer(montantPaye, reste);
    if (montant <= 0 || paiementEnCours.current) return;
    paiementEnCours.current = true;
    payer.mutate(
      {
        employe: choisi.id,
        mode,
        montant,
        ...(mode === 'mobile' ? { reference: reference.trim() } : {}),
      },
      {
        onSuccess: (reponse) => {
          setMontantPaye('');
          setReference('');
          afficher(t('gestion.personnel.toasts.paiement', { code: reponse.depenses[0] }));
        },
        onError: signaler,
        onSettled: () => {
          paiementEnCours.current = false;
        },
      },
    );
  };

  const surPayerLesRestes = () => {
    if (referenceRefusee() || paiementEnCours.current) return;
    paiementEnCours.current = true;
    payerRestes.mutate(
      { mode, ...(mode === 'mobile' ? { reference: reference.trim() } : {}) },
      {
        onSuccess: (reponse) => {
          setReference('');
          afficher(t('gestion.personnel.toasts.payes', { count: reponse.depenses.length }));
        },
        onError: signaler,
        onSettled: () => {
          paiementEnCours.current = false;
        },
      },
    );
  };

  const surValider = (accord: boolean) => {
    if (!instantane.demande) return;
    const titre = t('gestion.personnel.titreEtat', {
      mois: formaterMois(instantane.mois, i18n.language),
    });
    decider.mutate(
      { id: instantane.demande.id, accord },
      {
        onSuccess: () =>
          afficher(t(accord ? 'demandes.toastAccorde' : 'demandes.toastRefuse', { titre })),
        onError: (erreur) =>
          afficher(
            t(
              codeErreur(erreur) === 'deja_decidee'
                ? 'demandes.toastDejaDecidee'
                : 'demandes.toastErreur',
            ),
          ),
      },
    );
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <EtatDePaie
          instantane={instantane}
          droits={droits}
          totaux={totaux(employes)}
          occupe={occupe}
          onChoisirLeJour={(jour) => choisirLeJour.mutate(jour, { onError: signaler })}
          onSoumettre={() =>
            soumettre.mutate(undefined, {
              onSuccess: () => afficher(t('gestion.personnel.toasts.soumis')),
              onError: signaler,
            })
          }
          onPreparer={() =>
            preparer.mutate(instantane.aPreparer ?? instantane.mois, {
              onSuccess: () => afficher(t('gestion.personnel.toasts.prepare')),
              onError: signaler,
            })
          }
          onValider={surValider}
          onPayerLesRestes={surPayerLesRestes}
        />
        <div className={styles.barreEquipe}>
          <h2 className={styles.titreEquipe}>
            {t('gestion.personnel.equipe', { count: employes.length })}
          </h2>
          {profil === 'gerant' && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => setNouvelEmploye(true)}
            >
              <span aria-hidden>+ </span>
              {t('gestion.personnel.employe.ajouter')}
            </button>
          )}
        </div>
        <div className={styles.rangee}>
          <TableauPaie employes={employes} choisi={choisi.id} onChoisir={choisir} />
          <FicheEmploye
            instantane={instantane}
            employe={choisi}
            droits={droits}
            occupe={occupe}
            erreurServeur={erreurServeur}
            mode={mode}
            montantPaye={montantPaye}
            onMode={(m) => {
              setMode(m);
              setReferenceManquante(false);
            }}
            reference={reference}
            referenceManquante={referenceManquante}
            onReference={(r) => {
              setReference(r);
              setReferenceManquante(false);
            }}
            onMontantPaye={setMontantPaye}
            onAjouter={surAjouter}
            onRetirer={(id) => retirer.mutate(id, { onError: signaler })}
            onModifierLigne={setLigneEnEdition}
            onRetenues={(absences, avances) =>
              modifierLigne.mutate(
                { employe: choisi.id, absences, avances },
                {
                  onSuccess: () => afficher(t('gestion.personnel.toasts.retenues')),
                  onError: signaler,
                },
              )
            }
            onPayer={surPayer}
            onModifier={() => setErreurServeur(null)}
            joursProposes={absencesProposees.data?.[choisi.id]}
            onModifierFiche={
              profil === 'gerant' && choisi.employeId !== undefined
                ? () => void ouvrirLaFiche(choisi.employeId as number)
                : undefined
            }
          />
        </div>
        <CalendrierPaies
          instantane={instantane}
          droits={droits}
          occupe={occupe}
          onPlanifier={(mois, jour) => planifier.mutate({ mois, jour }, { onError: signaler })}
        />
      </div>
      {ligneEnEdition && (
        <ModaleLigne
          ligne={ligneEnEdition}
          envoiEnCours={modifierAjustement.isPending}
          onFermer={() => setLigneEnEdition(null)}
          onConfirmer={(libelle, montant) =>
            modifierAjustement.mutate(
              { id: ligneEnEdition.id, libelle, montant },
              {
                onSuccess: () => {
                  setLigneEnEdition(null);
                  afficher(t('gestion.personnel.toasts.ligne'));
                },
                onError: (erreur) => {
                  setLigneEnEdition(null);
                  signaler(erreur);
                },
              },
            )
          }
        />
      )}
      {edition && (
        <ModaleEmploye
          initial={edition.fiche}
          envoiEnCours={modifierEmploye.isPending}
          onFermer={() => setEdition(null)}
          onConfirmer={async (employe) => {
            try {
              await modifierEmploye.mutateAsync({
                id: edition.id,
                employe: { ...employe, actif: employe.actif ?? true },
              });
              setEdition(null);
              afficher(t('gestion.personnel.employe.toastModifie', { nom: employe.nom }));
              return null;
            } catch (erreur) {
              return (
                codeOuTexte(erreur, (c) => i18n.exists(`gestion.personnel.employe.erreurs.${c}`)) ??
                'defaut'
              );
            }
          }}
        />
      )}
      {nouvelEmploye && (
        <ModaleEmploye
          envoiEnCours={creerEmploye.isPending}
          onFermer={() => setNouvelEmploye(false)}
          onConfirmer={async (employe) => {
            try {
              await creerEmploye.mutateAsync(employe);
              setNouvelEmploye(false);
              afficher(t('gestion.personnel.employe.toast', { nom: employe.nom }));
              return null;
            } catch (erreur) {
              return (
                codeOuTexte(erreur, (c) => i18n.exists(`gestion.personnel.employe.erreurs.${c}`)) ??
                'defaut'
              );
            }
          }}
        />
      )}
    </>
  );
}
