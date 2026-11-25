import { useUtilisateurCourant } from '@/auth';
import { ErreurApi } from '@/api';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast, afficherRefus } from '@/ui';
import { formaterNombre } from '@/utils';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { jourCourt } from './affichage.ts';
import {
  codeErreur,
  ouvrirLeRecu,
  useEnregistrerFournisseur,
  useAnnulerReception,
  useFournisseurs,
  usePayer,
  usePlanifier,
  useReceptionner,
  useRelancer,
  useReplanifier,
} from './api.ts';
import { Factures } from './Factures.tsx';
import { Fiches } from './Fiches.tsx';
import styles from './Fournisseurs.module.css';
import { ModalePaiement } from './ModalePaiement.tsx';
import { ModaleFournisseur, type SaisieFournisseur } from './ModaleFournisseur.tsx';
import { ModaleReception } from './ModaleReception.tsx';
import { Receptions } from './Receptions.tsx';
import {
  commandesAvecManque,
  commandesPlanifiees,
  detteFournisseurs,
  droitsFournisseurs,
  facturesEnRetard,
} from './regles.ts';
import type { Commande, Facture, ModePaiement, NouvelleCommande } from './types.ts';

const ONGLETS = ['receptions', 'fournisseurs', 'dettes'] as const;
type Onglet = (typeof ONGLETS)[number];
const ONGLET_PAR_DEFAUT: Onglet = 'receptions';

/** Codes d'erreur de saisie du serveur : la fenêtre reste ouverte. */
const ERREURS_DE_SAISIE = [
  'quantite_obligatoire',
  'quantite_trop_grande',
  'prix_obligatoire',
  'reference_obligatoire',
  'reference_invalide',
  'mode_inconnu',
];

/** Fenêtre ouverte : la réception d'un bon ou le paiement d'une facture (une seule à la fois). */
type Fenetre =
  | { genre: 'reception'; numero: string }
  | { genre: 'paiement'; numero: string }
  | { genre: 'fiche'; id?: string };

/**
 * Gestion › Fournisseurs (US-100 à US-103) : réceptions et bons de commande, fiches fournisseurs,
 * factures et dettes. Le gérant planifie, réceptionne, relance, replanifie et paie ; le
 * propriétaire consulte (cahier des charges §3.3).
 */
export default function EcranFournisseurs({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useFournisseurs(nom);
  const planifier = usePlanifier(nom);
  const receptionner = useReceptionner(nom);
  const relancer = useRelancer(nom);
  const replanifier = useReplanifier(nom);
  const payer = usePayer(nom);
  const annulerReception = useAnnulerReception(nom);
  const enregistrer = useEnregistrerFournisseur(nom);
  // La fenêtre appartient à la personne qui l'a ouverte : changer d'utilisateur la ferme.
  const [ouverte, setOuverte] = useState<{ nom?: string; fenetre: Fenetre | null }>({
    fenetre: null,
  });
  const fenetre = ouverte.nom === nom ? ouverte.fenetre : null;
  const ouvrir = (suivante: Fenetre | null) => setOuverte({ nom, fenetre: suivante });

  const [parametres, setParametres] = useSearchParams();
  const parametre = parametres.get('onglet');
  const onglet: Onglet = ONGLETS.find((o) => o === parametre) ?? ONGLET_PAR_DEFAUT;
  const choisirOnglet = useCallback(
    (suivant: Onglet) =>
      setParametres(suivant === ONGLET_PAR_DEFAUT ? {} : { onglet: suivant }, { replace: true }),
    [setParametres],
  );

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.fournisseurs.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const droits = droitsFournisseurs(profil);
  // Un seul envoi à la fois : les boutons des listes et des fenêtres sont verrouillés pendant l'envoi.
  const enCours =
    planifier.isPending ||
    receptionner.isPending ||
    relancer.isPending ||
    replanifier.isPending ||
    payer.isPending ||
    annulerReception.isPending;
  const nomFournisseur = (id: string) =>
    instantane.fournisseurs.find((f) => f.id === id)?.nom ?? '';

  const naviguerEntreOnglets = (evenement: KeyboardEvent<HTMLButtonElement>) => {
    const decalage = evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    const rang = ONGLETS.indexOf(onglet);
    const suivant =
      evenement.key === 'Home'
        ? ONGLETS[0]
        : evenement.key === 'End'
          ? ONGLETS[ONGLETS.length - 1]
          : decalage
            ? ONGLETS[(rang + decalage + ONGLETS.length) % ONGLETS.length]
            : undefined;
    if (!suivant) return;
    evenement.preventDefault();
    choisirOnglet(suivant);
    requestAnimationFrame(() => document.getElementById(`onglet-fournisseurs-${suivant}`)?.focus());
  };

  /** Une action refusée parce que la ligne a changé : la liste est relue, on le dit. */
  const echec = (erreur: unknown) => {
    const code = codeErreur(erreur);
    const perimee = [
      'commande_deja_recue',
      'reception_close',
      'aucun_manquant',
      'facture_non_payable',
      'commande_inconnue',
      'facture_inconnue',
    ].includes(code ?? '');
    afficherRefus(
      afficher,
      t,
      erreur,
      code === 'semaine_non_ouverte'
        ? 'gestion.fournisseurs.toasts.semaineFermee'
        : perimee
          ? 'gestion.fournisseurs.toasts.dejaFait'
          : 'gestion.fournisseurs.toasts.erreur',
    );
  };

  /** Renvoie le code d'erreur du serveur, ou `null` quand la réception est planifiée. */
  const planifierReception = async (saisie: NouvelleCommande): Promise<string | null> => {
    try {
      const reponse = await planifier.mutateAsync(saisie);
      afficher(
        t('gestion.fournisseurs.toasts.planifiee', { numero: reponse.commande?.numero ?? '' }),
      );
      return null;
    } catch (erreur) {
      return codeErreur(erreur) ?? 'defaut';
    }
  };

  const annulerBon = async (commande: Commande) => {
    try {
      await annulerReception.mutateAsync({ commande: commande.numero });
      afficher(t('gestion.fournisseurs.toasts.annulee', { numero: commande.numero }));
    } catch (erreur) {
      echec(erreur);
    }
  };

  const relancerManquant = async (commande: Commande) => {
    try {
      await relancer.mutateAsync({ commande: commande.numero });
      afficher(
        t('gestion.fournisseurs.toasts.relance', { nom: nomFournisseur(commande.fournisseur) }),
      );
    } catch (erreur) {
      echec(erreur);
    }
  };

  const replanifierReliquat = async (commande: Commande) => {
    try {
      const reponse = await replanifier.mutateAsync({ commande: commande.numero });
      afficher(
        t('gestion.fournisseurs.toasts.replanifie', {
          date: jourCourt(reponse.reliquat?.jour ?? instantane.jours[1] ?? '', langue),
        }),
      );
    } catch (erreur) {
      echec(erreur);
    }
  };

  /** Erreurs de saisie : la fenêtre reste ouverte, la saisie est gardée, l'erreur est sur le champ. */
  const erreurDeSaisie = (erreur: unknown): string | null => {
    // Le serveur refuse un prix à la décimale (400 sur `prix_unitaire`, sans code) : la fenêtre l'explique.
    if (erreur instanceof ErreurApi && erreur.status === 400) {
      const champs = (erreur.details ?? {}) as { prix_unitaire?: unknown };
      if (champs.prix_unitaire) return 'prix_decimal';
    }
    const code = codeErreur(erreur);
    return code && ERREURS_DE_SAISIE.includes(code) ? code : null;
  };

  const confirmerReception = async (
    numero: string,
    quantite: number,
    observation: string,
    prix?: number,
  ): Promise<string | null> => {
    try {
      const reponse = await receptionner.mutateAsync({
        commande: numero,
        quantite,
        ...(observation ? { observation } : {}),
        ...(prix ? { prix } : {}),
      });
      ouvrir(null);
      afficher(
        t(
          reponse.commande?.statut === 'partielle'
            ? 'gestion.fournisseurs.toasts.partielle'
            : 'gestion.fournisseurs.toasts.recue',
        ),
      );
      return null;
    } catch (erreur) {
      const saisie = erreurDeSaisie(erreur);
      if (saisie) return saisie;
      ouvrir(null);
      echec(erreur);
      return null;
    }
  };

  const confirmerPaiement = async (
    numero: string,
    mode: ModePaiement,
    reference: string,
  ): Promise<string | null> => {
    try {
      const reponse = await payer.mutateAsync({
        facture: numero,
        mode,
        ...(mode === 'mobile' ? { reference } : {}),
      });
      ouvrir(null);
      afficher(t('gestion.fournisseurs.toasts.paye', { numero: reponse.depense ?? '' }));
      return null;
    } catch (erreur) {
      const saisie = erreurDeSaisie(erreur);
      if (saisie) return saisie;
      ouvrir(null);
      echec(erreur);
      return null;
    }
  };

  const ficheOuverte =
    fenetre?.genre === 'fiche'
      ? instantane.fournisseurs.find((f) => f.id === fenetre.id)
      : undefined;

  const enregistrerFiche = async (saisie: SaisieFournisseur): Promise<string | null> => {
    try {
      await enregistrer.mutateAsync({ id: ficheOuverte?.id, saisie });
      ouvrir(null);
      afficher(
        t(
          ficheOuverte
            ? 'gestion.fournisseurs.fiche.toastModifie'
            : 'gestion.fournisseurs.fiche.toastCree',
          { nom: saisie.nom },
        ),
      );
      return null;
    } catch (erreur) {
      if (erreur instanceof ErreurApi && erreur.status === 400) {
        const champs = Object.keys((erreur.details ?? {}) as object);
        if (champs.includes('nom')) return 'nom';
        if (champs.includes('matieres')) return 'matieres';
      }
      return 'defaut';
    }
  };

  const commandeOuverte =
    fenetre?.genre === 'reception'
      ? instantane.commandes.find((c) => c.numero === fenetre.numero && c.statut === 'planifiee')
      : undefined;
  const factureOuverte =
    fenetre?.genre === 'paiement'
      ? instantane.factures.find((f) => f.numero === fenetre.numero && f.statut === 'a-payer')
      : undefined;

  const enRetard = facturesEnRetard(instantane.factures).length;
  const manquants = commandesAvecManque(instantane.commandes).length;
  const kpis = [
    {
      cle: 'dette',
      valeur: `${formaterNombre(detteFournisseurs(instantane.factures))} FCFA`,
      couleur: 'var(--ob-surveiller-texte)',
    },
    {
      cle: 'retard',
      valeur: String(enRetard),
      couleur: enRetard ? 'var(--ob-bloquant-texte)' : 'var(--ob-encre)',
    },
    {
      cle: 'manquants',
      valeur: String(manquants),
      couleur: manquants ? 'var(--ob-surveiller-texte)' : 'var(--ob-encre)',
    },
    {
      cle: 'planifiees',
      valeur: String(commandesPlanifiees(instantane.commandes).length),
      couleur: 'var(--ob-encre)',
    },
  ] as const;

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <div className={styles.kpis}>
          {kpis.map((k) => (
            <div className={styles.kpi} key={k.cle}>
              <div className={styles.kpiLibelle}>{t(`gestion.fournisseurs.kpis.${k.cle}`)}</div>
              <div className={styles.kpiValeur} style={{ color: k.couleur }}>
                {k.valeur}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.entete}>
          <div
            className={styles.onglets}
            role="tablist"
            aria-label={t('gestion.fournisseurs.sections')}
          >
            {ONGLETS.map((cle) => (
              <button
                type="button"
                key={cle}
                id={`onglet-fournisseurs-${cle}`}
                role="tab"
                aria-selected={onglet === cle}
                aria-controls="panneau-fournisseurs"
                tabIndex={onglet === cle ? 0 : -1}
                className={`${styles.onglet} ${onglet === cle ? styles.ongletActif : ''}`}
                onClick={() => choisirOnglet(cle)}
                onKeyDown={naviguerEntreOnglets}
              >
                {t(`gestion.fournisseurs.onglets.${cle}`)}
              </button>
            ))}
          </div>
          {droits.modifier && onglet === 'fournisseurs' && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => ouvrir({ genre: 'fiche' })}
            >
              <span aria-hidden>+ </span>
              {t('gestion.fournisseurs.fiche.ajouter')}
            </button>
          )}
        </div>

        <div
          className={styles.panneau}
          id="panneau-fournisseurs"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`onglet-fournisseurs-${onglet}`}
        >
          {onglet === 'receptions' && (
            <Receptions
              instantane={instantane}
              peutModifier={droits.modifier}
              enCours={enCours}
              onReceptionner={(c) => ouvrir({ genre: 'reception', numero: c.numero })}
              onAnnuler={(c) => void annulerBon(c)}
              onRelancer={(c) => void relancerManquant(c)}
              onReplanifier={(c) => void replanifierReliquat(c)}
              onPlanifier={planifierReception}
            />
          )}
          {onglet === 'fournisseurs' && (
            <Fiches
              instantane={instantane}
              peutModifier={droits.modifier}
              onModifier={(f) => ouvrir({ genre: 'fiche', id: f.id })}
            />
          )}
          {onglet === 'dettes' && (
            <Factures
              instantane={instantane}
              peutModifier={droits.modifier}
              enCours={enCours}
              onPayer={(f: Facture) => ouvrir({ genre: 'paiement', numero: f.numero })}
              onRecu={(f) => {
                if (f.paiement !== undefined) ouvrirLeRecu(f.paiement);
                afficher(t('gestion.fournisseurs.toasts.recuPret'));
              }}
            />
          )}
        </div>
      </div>

      {droits.modifier && commandeOuverte && (
        <ModaleReception
          commande={commandeOuverte}
          fournisseur={instantane.fournisseurs.find((f) => f.id === commandeOuverte.fournisseur)}
          enCours={enCours}
          avecPrix={commandeOuverte.matiere !== 'farine'}
          onFermer={() => ouvrir(null)}
          onIncomplet={() => afficher(t('gestion.fournisseurs.toasts.quantiteRecue'))}
          onConfirmer={(quantite, observation, prix) =>
            confirmerReception(commandeOuverte.numero, quantite, observation, prix)
          }
        />
      )}
      {droits.modifier &&
        fenetre?.genre === 'fiche' &&
        (fenetre.id === undefined || ficheOuverte) && (
          <ModaleFournisseur
            fournisseur={ficheOuverte}
            envoiEnCours={enregistrer.isPending}
            onFermer={() => ouvrir(null)}
            onConfirmer={enregistrerFiche}
          />
        )}
      {droits.modifier && factureOuverte && (
        <ModalePaiement
          facture={factureOuverte}
          fournisseur={instantane.fournisseurs.find((f) => f.id === factureOuverte.fournisseur)}
          enCours={enCours}
          onFermer={() => ouvrir(null)}
          onConfirmer={(mode, reference) =>
            confirmerPaiement(factureOuverte.numero, mode, reference)
          }
        />
      )}
    </>
  );
}
