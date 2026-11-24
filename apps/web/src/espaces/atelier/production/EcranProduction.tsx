import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';

import { cheminEcran, ECRANS, type Ecran } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { ErreurApi } from '@/api';
import { SIMULATION } from '@/simulation';
import { codeErreur, useActionsProduction, useProduction, type ActionsProduction } from './api.ts';
import { Cycle } from './Cycle.tsx';
import { FicheTechnique } from './FicheTechnique.tsx';
import { Historique } from './Historique.tsx';
import { ModaleCloture } from './ModaleCloture.tsx';
import { PanneauConsommation } from './PanneauConsommation.tsx';
import { PanneauPlan } from './PanneauPlan.tsx';
import { PanneauRealise } from './PanneauRealise.tsx';
import styles from './Production.module.css';
import { ResteAProduire } from './ResteAProduire.tsx';
import {
  actionDuCycle,
  brouillonDeConsommation,
  brouillonDuRealise,
  consommationSaisie,
  realiseSaisi,
  ecartAJustifier,
  ecartEnKg,
  limiteEcartKg,
  bornerSupplement,
  consommationComplete,
  droitsProduction,
  MATIERES_CONSOMMEES,
  peutSaisir,
  realiseComplet,
  supplementEnDemande,
  supplementPossible,
  supplementVide,
  totalSacs,
  type ActionCycle,
} from './regles.ts';
import {
  CLES_PRODUIT,
  ONGLETS,
  type CleProduit,
  type InstantaneProduction,
  type MotifEcart,
  type MotifSupplement,
  type Onglet,
  type Quantites,
} from './types.ts';

const ONGLET_PAR_DEFAUT: Onglet = 'plan';

/**
 * Atelier › Production (US-080 à US-089) : le cycle de la session, le plan et d'où vient la demande,
 * le réalisé, la consommation des matières et l'historique. `?fiche=` ouvre la fiche technique d'un
 * produit. Le responsable de production de la semaine saisit ; le gérant valide le plan ; le
 * propriétaire consulte (et modifie les fiches).
 */
export default function EcranProduction({ ecran }: { ecran: Ecran }) {
  const { utilisateur } = useUtilisateurCourant();
  const [parametres] = useSearchParams();
  const fiche = parametres.get('fiche');
  if (fiche && utilisateur?.name && utilisateur.profil) {
    return (
      <FicheTechnique
        ecran={ecran}
        ficheId={fiche}
        utilisateur={utilisateur.name}
        peutModifier={
          droitsProduction(utilisateur.profil, utilisateur.name, { responsable: '', gerant: '' })
            .modifierFiches
        }
        estChef={utilisateur.profil === 'production'}
        cheminRetour={cheminEcran(ecran)}
        depuis={
          parametres.get('depuis') === 'parametres' && utilisateur.profil !== 'production'
            ? { chemin: cheminEcran({ espace: 'gestion', cle: 'parametres' }) }
            : undefined
        }
      />
    );
  }
  return <VueProduction ecran={ecran} />;
}

function VueProduction({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const requete = useProduction(nom);
  const actions = useActionsProduction(nom);
  const instantane = requete.data;

  if (!instantane || !utilisateur?.name || !utilisateur.profil) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('atelier.production.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }
  return (
    <Contenu
      // Une nouvelle session repart de zéro : les brouillons de la précédente ne servent plus.
      key={`${instantane.session.date}-${instantane.session.type}`}
      ecran={ecran}
      instantane={instantane}
      nom={utilisateur.name}
      profil={utilisateur.profil}
      actions={actions}
    />
  );
}

type ContenuProps = {
  ecran: Ecran;
  instantane: InstantaneProduction;
  nom: string;
  profil: Profil;
  actions: ActionsProduction;
};

function Contenu({ ecran, instantane, nom, profil, actions }: ContenuProps) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const [parametres, setParametres] = useSearchParams();
  const parametre = parametres.get('onglet');
  const onglet: Onglet = ONGLETS.find((o) => o === parametre) ?? ONGLET_PAR_DEFAUT;
  const choisirOnglet = useCallback(
    (suivant: Onglet) =>
      setParametres(suivant === ONGLET_PAR_DEFAUT ? {} : { onglet: suivant }, { replace: true }),
    [setParametres],
  );

  const [realise, setRealise] = useState(() => brouillonDuRealise(instantane.realise));
  const [consommation, setConsommation] = useState(() =>
    brouillonDeConsommation(instantane.consommation),
  );
  const [supplement, setSupplement] = useState<Quantites>(supplementVide);
  const [motifSupplement, setMotifSupplement] = useState<MotifSupplement | ''>('');
  const [motifEcart, setMotifEcart] = useState<MotifEcart | ''>('');
  const [texteEcart, setTexteEcart] = useState('');
  const [fenetre, setFenetre] = useState(false);
  const [occupe, setOccupe] = useState(false);
  // Champ à focaliser une fois l'onglet affiché (clôture refusée : on mène à ce qui manque).
  const aFocaliser = useRef<string | null>(null);

  useEffect(() => {
    const champ = aFocaliser.current ? document.getElementById(aFocaliser.current) : null;
    if (!champ) return;
    champ.focus();
    aFocaliser.current = null;
  }, [onglet]);

  const mener = (suivant: Onglet, champ: string) => {
    if (suivant === onglet) {
      document.getElementById(champ)?.focus();
      return;
    }
    aFocaliser.current = champ;
    choisirOnglet(suivant);
  };

  const droits = droitsProduction(profil, nom, {
    responsable: instantane.responsable,
    gerant: instantane.gerant,
  });
  const { etape } = instantane;
  const saisie = peutSaisir(etape, droits);
  const action = actionDuCycle(etape, droits);
  const lectureSeule = saisie
    ? null
    : droits.responsable
      ? etape === 'cloturee'
        ? 'cloturee'
        : 'ouverture'
      : profil === 'proprietaire'
        ? 'proprietaire'
        : 'responsable';

  // Le serveur garde la valeur enregistrée ; le responsable voit ce qu'il tape, les autres le serveur.
  const realiseAffiche = saisie ? realise : brouillonDuRealise(instantane.realise);
  const consommationAffichee = saisie
    ? consommation
    : brouillonDeConsommation(instantane.consommation);

  const surErreur = useCallback(
    (erreur: unknown) => {
      const code = codeErreur(erreur);
      const connu = code && i18n.exists(`atelier.production.erreurs.${code}`);
      afficher(
        connu
          ? t(`atelier.production.erreurs.${code}`)
          : // Un refus que l'écran ne connaît pas : le serveur dit pourquoi, en français.
            erreur instanceof ErreurApi && erreur.message && !SIMULATION
            ? erreur.message
            : t('atelier.production.erreurs.defaut'),
      );
    },
    [afficher, i18n, t],
  );

  const agir = async (travail: () => Promise<unknown>, message?: string) => {
    setOccupe(true);
    try {
      await travail();
      if (message) afficher(message);
      return true;
    } catch (erreur) {
      surErreur(erreur);
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const surAction = (suivante: ActionCycle) => {
    if (suivante === 'proposer') {
      void agir(() => actions.proposerLePlan(), t('atelier.production.toasts.planPropose'));
    } else if (suivante === 'valider') {
      void agir(() => actions.validerLePlan(), t('atelier.production.toasts.planValide'));
    } else if (suivante === 'ouvrir') {
      void agir(() => actions.ouvrir(), t('atelier.production.toasts.ouverte'));
    } else {
      const reel = realiseSaisi(realise);
      const conso = consommationSaisie(consommation);
      if (!realiseComplet(reel) || !consommationComplete(conso)) {
        afficher(t('atelier.production.toasts.clotureImpossible'));
        const manqueLeRealise = !realiseComplet(reel);
        const premier = manqueLeRealise
          ? CLES_PRODUIT.find((cle) => realise[cle] === '')
          : MATIERES_CONSOMMEES.find((m) => consommation[m] === '');
        mener(
          manqueLeRealise ? 'realise' : 'consommation',
          `${manqueLeRealise ? 'realise' : 'conso'}-${premier}`,
        );
        return;
      }
      // R10 : un écart au-delà du seuil se justifie avant de clôturer.
      const sacs = instantane.plan.sacs;
      if (
        !instantane.justification &&
        ecartAJustifier(ecartEnKg(conso, sacs), limiteEcartKg(instantane.seuilEcartKg, sacs))
      ) {
        afficher(t('atelier.production.toasts.justificationRequise'));
        mener('consommation', 'justification-motif-perte');
        return;
      }
      setFenetre(true);
    }
  };

  const enregistrerLeRealise = () =>
    void agir(
      () => actions.enregistrerLeRealise(realiseSaisi(realise)),
      t('atelier.production.toasts.realiseEnregistre'),
    );

  const annulerLaFournee = (numero: number) =>
    void agir(async () => {
      const reponse = await actions.annulerLaDerniereFournee(numero);
      setRealise(brouillonDuRealise(reponse.instantane.realise));
    }, t('atelier.production.realise.annulee'));

  const enregistrerLaConsommation = () =>
    void agir(
      () => actions.enregistrerLaConsommation(consommationSaisie(consommation)),
      t('atelier.production.toasts.consommationEnregistree'),
    );

  const envoyerLaJustification = () => {
    if (!motifEcart) {
      afficher(t('atelier.production.toasts.motifObligatoire'));
      document.getElementById('justification-motif-perte')?.focus();
      return;
    }
    void agir(
      () =>
        actions.justifier({
          motif: motifEcart,
          texte: texteEcart.trim(),
          consommation: consommationSaisie(consommation),
        }),
      t('atelier.production.toasts.gerantInforme'),
    );
  };

  const ajusterLeSupplement = (produit: CleProduit, pas: number) =>
    setSupplement((avant) => ({ ...avant, [produit]: bornerSupplement(avant[produit] + pas) }));

  const reprendreLaSuggestion = () => {
    setSupplement({
      BAG: bornerSupplement(instantane.demande.BAG.besoin),
      KO: bornerSupplement(instantane.demande.KO.besoin),
      GC: bornerSupplement(instantane.demande.GC.besoin),
    });
    setMotifSupplement((avant) => avant || 'habituels');
  };

  const ajouterLeSupplement = () => {
    if (totalSacs(supplement) === 0) {
      afficher(t('atelier.production.toasts.supplementVide'));
      document.getElementById('supplement-plus-BAG')?.focus();
      return;
    }
    if (!motifSupplement) {
      afficher(t('atelier.production.toasts.motifObligatoire'));
      document.getElementById('supplement-motif-habituels')?.focus();
      return;
    }
    const enDemande = supplementEnDemande(etape);
    void agir(async () => {
      await actions.ajouterUnSupplement({ sacs: supplement, motif: motifSupplement });
      setSupplement(supplementVide());
      setMotifSupplement('');
      afficher(
        enDemande
          ? t('atelier.production.toasts.demandeEnvoyee', { gerant: instantane.gerant })
          : t('atelier.production.toasts.supplementAjoute'),
      );
    });
  };

  const confirmerLaCloture = () =>
    void (async () => {
      const fait = await agir(
        () =>
          actions.cloturer({
            realise: realiseSaisi(realise),
            consommation: consommationSaisie(consommation),
          }),
        t('atelier.production.toasts.cloturee'),
      );
      if (fait) setFenetre(false);
    })();

  const naviguerEntreOnglets = (evenement: KeyboardEvent<HTMLButtonElement>) => {
    const decalage = evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    if (!decalage) return;
    const suivant = ONGLETS[(ONGLETS.indexOf(onglet) + decalage + ONGLETS.length) % ONGLETS.length];
    if (!suivant) return;
    evenement.preventDefault();
    choisirOnglet(suivant);
    requestAnimationFrame(() => document.getElementById(`onglet-production-${suivant}`)?.focus());
  };

  const cheminCommandes = ECRANS.some((e) => e.cle === 'session' && e.profils.includes(profil))
    ? '/comptoir/session?onglet=commandes'
    : null;
  const realiseNumerique = realiseSaisi(realiseAffiche);

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <Cycle instantane={instantane} action={action} occupe={occupe} onAction={surAction} />

        {etape === 'en-cours' && (
          <ResteAProduire
            plan={instantane.plan}
            realise={realiseNumerique}
            onSaisir={
              droits.responsable && onglet !== 'realise'
                ? () => choisirOnglet('realise')
                : undefined
            }
          />
        )}

        <div
          className={styles.onglets}
          role="tablist"
          aria-label={t('atelier.production.sections')}
        >
          {ONGLETS.map((cle) => (
            <button
              type="button"
              key={cle}
              id={`onglet-production-${cle}`}
              role="tab"
              aria-selected={onglet === cle}
              aria-controls="panneau-production"
              tabIndex={onglet === cle ? 0 : -1}
              className={`${styles.onglet} ${onglet === cle ? styles.ongletActif : ''}`}
              onClick={() => choisirOnglet(cle)}
              onKeyDown={naviguerEntreOnglets}
            >
              {t(`atelier.production.onglets.${cle}`)}
            </button>
          ))}
        </div>

        <div
          className={styles.panneau}
          id="panneau-production"
          role="tabpanel"
          aria-labelledby={`onglet-production-${onglet}`}
        >
          {onglet === 'plan' && (
            <PanneauPlan
              instantane={instantane}
              peutAjuster={supplementPossible(etape, droits, instantane.demandeEnAttente !== null)}
              supplement={supplement}
              motif={motifSupplement}
              occupe={occupe}
              cheminCommandes={cheminCommandes}
              onSupplement={ajusterLeSupplement}
              onMotif={(m) => setMotifSupplement(m)}
              onReprendreSuggestion={reprendreLaSuggestion}
              onAjouter={ajouterLeSupplement}
              cheminFiche={(id) => `${cheminEcran(ecran)}?fiche=${id}`}
            />
          )}
          {onglet === 'realise' && (
            <PanneauRealise
              plan={instantane.plan}
              valeurs={realiseAffiche}
              lectureSeule={lectureSeule}
              occupe={occupe}
              onChange={(produit, texte) => setRealise((avant) => ({ ...avant, [produit]: texte }))}
              onEnregistrer={enregistrerLeRealise}
              derniereFournee={instantane.derniereFournee ?? null}
              onAnnulerFournee={annulerLaFournee}
            />
          )}
          {onglet === 'consommation' && (
            <PanneauConsommation
              instantane={instantane}
              valeurs={consommationAffichee}
              lectureSeule={lectureSeule}
              occupe={occupe}
              motif={motifEcart}
              texte={texteEcart}
              onChange={(matiere, texte) =>
                setConsommation((avant) => ({ ...avant, [matiere]: texte }))
              }
              onEnregistrer={enregistrerLaConsommation}
              onMotif={(m) => setMotifEcart(m)}
              onTexte={setTexteEcart}
              onEnvoyer={envoyerLaJustification}
            />
          )}
        </div>

        <Historique instantane={instantane} />
      </div>

      {fenetre && (
        <ModaleCloture
          instantane={instantane}
          realise={realiseSaisi(realise)}
          consommation={consommationSaisie(consommation)}
          occupe={occupe}
          onFermer={() => setFenetre(false)}
          onConfirmer={confirmerLaCloture}
        />
      )}
    </>
  );
}
