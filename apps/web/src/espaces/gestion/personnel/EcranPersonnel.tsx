import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { formaterMois } from './affichage.ts';
import {
  codeErreur,
  useAjouterLigne,
  useChoisirLeJour,
  useDeciderLaPaie,
  usePayer,
  usePayerLesRestes,
  usePersonnel,
  usePlanifierLeMois,
  useRetirerLigne,
  useSoumettre,
} from './api.ts';
import { CalendrierPaies } from './CalendrierPaies.tsx';
import { EtatDePaie } from './EtatDePaie.tsx';
import { FicheEmploye } from './FicheEmploye.tsx';
import styles from './Personnel.module.css';
import { droitsPaie, montantAPayer, calculerPaie, totaux } from './regles.ts';
import { TableauPaie } from './TableauPaie.tsx';
import type { ModePaiement, NouvelAjustement } from './types.ts';

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
  const choisirLeJour = useChoisirLeJour(nom);
  const planifier = usePlanifierLeMois(nom);
  const soumettre = useSoumettre(nom);
  const payer = usePayer(nom);
  const payerRestes = usePayerLesRestes(nom);
  const decider = useDeciderLaPaie(nom);
  const [parametres, setParametres] = useSearchParams();
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [montantPaye, setMontantPaye] = useState('');
  const [reference, setReference] = useState('');
  const [referenceManquante, setReferenceManquante] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const instantane = requete.data;
  const droits = droitsPaie(profil);
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
    choisirLeJour,
    planifier,
    soumettre,
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

  /** Un refus du serveur (règle ou droit) : l'écran se remet à jour et le dit. */
  const signaler = (erreur: unknown) => {
    const code = codeErreur(erreur);
    afficher(
      t(
        code === 'droit_insuffisant'
          ? 'gestion.personnel.toasts.droit'
          : code === 'etat_verrouille'
            ? 'gestion.personnel.toasts.verrouille'
            : code === 'paiement_ferme'
              ? 'gestion.personnel.toasts.paiementFerme'
              : code
                ? 'gestion.personnel.toasts.impossible'
                : 'gestion.personnel.toasts.erreur',
      ),
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
            setErreurServeur(codeErreur(erreur) ?? 'erreur');
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
    if (montant <= 0) return;
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
      },
    );
  };

  const surPayerLesRestes = () => {
    if (referenceRefusee()) return;
    payerRestes.mutate(
      { mode, ...(mode === 'mobile' ? { reference: reference.trim() } : {}) },
      {
        onSuccess: (reponse) => {
          setReference('');
          afficher(t('gestion.personnel.toasts.payes', { count: reponse.depenses.length }));
        },
        onError: signaler,
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
          onValider={surValider}
          onPayerLesRestes={surPayerLesRestes}
        />
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
            onPayer={surPayer}
            onModifier={() => setErreurServeur(null)}
          />
        </div>
        <CalendrierPaies
          instantane={instantane}
          droits={droits}
          occupe={occupe}
          onPlanifier={(mois, jour) => planifier.mutate({ mois, jour }, { onError: signaler })}
        />
      </div>
    </>
  );
}
