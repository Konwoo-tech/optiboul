import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, EnTetePage, useToast, messageOuDefaut } from '@/ui';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { dateCourte, nomDeSession } from './affichage.ts';
import { codeErreur, useActionsSession, useSessionComptoir } from './api.ts';
import { formaterNombre, lireEntier } from './calculs.ts';
import { FenetreReouverture } from '../caisses/FenetreReouverture.tsx';
import { Cloture } from './Cloture.tsx';
import { Commandes } from './Commandes.tsx';
import { Livraisons } from './Livraisons.tsx';
import { ModaleAutorisation } from './ModaleAutorisation.tsx';
import { ModaleBon } from './ModaleBon.tsx';
import { ModaleCloture } from './ModaleCloture.tsx';
import { BROUILLON_VIDE, type BrouillonMouvement } from './brouillonMouvement.ts';
import { Mouvements } from './Mouvements.tsx';
import styles from './Session.module.css';
import { useChampsLivraison, useFormulaireLivraison } from './useFormulaireLivraison.ts';
import { useRaccourcis } from './useRaccourcis.ts';

const ONGLETS = ['commandes', 'livraisons', 'mouvements', 'cloture'] as const;
type Onglet = (typeof ONGLETS)[number];
const ONGLET_PAR_DEFAUT: Onglet = 'livraisons';

type Fenetre =
  | { type: 'autorisation'; demandeId: string }
  | { type: 'bon'; livraisonId: string }
  | { type: 'cloture' }
  | { type: 'reouverture' };

/**
 * Comptoir › Session en cours (US-050 à US-057) : les commandes, les livraisons et leur
 * encaissement, les mouvements internes et la clôture de la session.
 */
export default function SessionComptoir() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const { data: instantane, isError, refetch } = useSessionComptoir(nom);
  const actions = useActionsSession(nom);

  const [parametres, setParametres] = useSearchParams();
  const parametre = parametres.get('onglet');
  const onglet: Onglet = ONGLETS.find((o) => o === parametre) ?? ONGLET_PAR_DEFAUT;
  const choisirOnglet = useCallback(
    (suivant: Onglet) =>
      setParametres(suivant === ONGLET_PAR_DEFAUT ? {} : { onglet: suivant }, { replace: true }),
    [setParametres],
  );

  const [brouillon, setBrouillon] = useState<BrouillonMouvement>(BROUILLON_VIDE);
  const [fenetre, setFenetre] = useState<Fenetre | null>(null);
  const [erreurReouverture, setErreurReouverture] = useState<string | null>(null);
  const [reouvertureEnCours, setReouvertureEnCours] = useState(false);

  const ouverte = instantane?.session.statut === 'ouverte';
  const direction = profil === 'gerant' || profil === 'proprietaire';
  const peutSaisir = ouverte && (profil === 'caissier' || profil === 'gerant');
  // Le propriétaire consulte : il ne saisit, ne relance et ne clôture pas (cahier des charges §3.3).
  const peutRelancer = peutSaisir;
  const peutLivrer = peutSaisir;
  const peutMouvementer = peutSaisir;
  const peutCloturer = peutSaisir;

  const surErreur = useCallback(
    (erreur: unknown) => {
      const code = codeErreur(erreur);
      // Un dépassement de plafond : le message du serveur dit combien encaisser, celui de l'écran non.
      const connu =
        code && code !== 'plafond_depasse' && i18n.exists(`comptoir.session.erreurs.${code}`);
      afficher(
        connu
          ? t(`comptoir.session.erreurs.${code}`)
          : messageOuDefaut(erreur, t('comptoir.session.erreurs.defaut')),
      );
    },
    [afficher, i18n, t],
  );

  const champs = useChampsLivraison();
  const livraison = useFormulaireLivraison({
    champs,
    instantane,
    peutSaisir: Boolean(peutLivrer),
    actions,
    surEnregistree: (enregistree) =>
      afficher(
        t('comptoir.session.livraisons.toasts.enregistree', {
          nom: enregistree.nom,
          numero: enregistree.numero,
        }),
      ),
    surEncaissee: ({ nom, montant }) =>
      afficher(
        t('comptoir.session.livraisons.toasts.encaissee', {
          nom,
          montant: formaterNombre(montant),
        }),
      ),
    surErreur,
    surAutorisation: ({ autorise, demande: nouvelle }) => {
      if (autorise) afficher(t('comptoir.session.livraisons.toasts.depassementAutorise'));
      else if (nouvelle) setFenetre({ type: 'autorisation', demandeId: nouvelle.id });
      else afficher(t('comptoir.session.livraisons.toasts.demandeEnvoyee'));
    },
  });

  useRaccourcis({
    'nouvelle-livraison': () => {
      if (!peutLivrer || fenetre) return;
      setFenetre(null);
      choisirOnglet('livraisons');
      livraison.reinitialiser();
    },
    encaisser: () => {
      if (fenetre || onglet !== 'livraisons' || !livraison.client) return;
      if (livraison.calcul.valide) void livraison.valider();
      else champs.recu.current?.focus();
    },
    bon: () => {
      if (fenetre) return;
      if (instantane?.dernierBon) setFenetre({ type: 'bon', livraisonId: instantane.dernierBon });
    },
    annuler: () => {
      if (fenetre) setFenetre(null);
      else if (onglet === 'livraisons' && (livraison.client || livraison.recherche)) {
        livraison.reinitialiser();
      }
    },
  });

  if (!instantane) {
    return isError ? (
      <EcranErreur
        titre={t('erreur.titre')}
        message={t('comptoir.session.erreurChargement')}
        libelleAction={t('erreur.reessayer')}
        onAction={() => void refetch()}
      />
    ) : (
      <EcranChargement />
    );
  }

  const { session } = instantane;
  const langue = i18n.language;
  const date = dateCourte(session.date, langue);
  const nomSession = nomDeSession(t, session.type);
  const suivante = instantane.prochaine?.type ?? (session.type === 'nuit' ? 'jour' : 'nuit');
  const dateSuivante = dateCourte(
    instantane.prochaine?.jour ??
      (session.type === 'nuit'
        ? new Date(Date.parse(`${session.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
        : session.date),
    langue,
  );
  // Le serveur n'ouvre pas encore la session d'après : celle qu'on vient de fermer reste la prochaine.
  const suivanteDejaFermee =
    instantane.prochaine !== undefined &&
    instantane.prochaine.jour === session.date &&
    instantane.prochaine.type === session.type;

  const kicker = ouverte
    ? t('coque.kickerSession', { heure: session.ouverteA, nom: session.ouvertePar })
    : t('coque.kickerSessionCloturee', { heure: session.clotureeA, nom: session.cloturePar });

  const bandeau = !ouverte
    ? t('comptoir.session.bandeau.cloturee', {
        session: nomSession,
        date,
        heure: session.clotureeA,
        nom: session.cloturePar,
      })
    : session.rouvertePar
      ? t('comptoir.session.bandeau.rouverte', {
          nom: session.rouvertePar,
          heure: session.rouverteA,
        })
      : null;
  const peutRouvrir = !ouverte && direction;
  const peutOuvrirLaSuivante =
    !ouverte && !suivanteDejaFermee && (profil === 'caissier' || profil === 'gerant');

  const agir = (action: () => Promise<unknown>) => action().catch(surErreur);

  const ajouterMouvement = async () => {
    const quantite = lireEntier(brouillon.quantite);
    if (!quantite) return setBrouillon({ ...brouillon, erreur: 'erreurQuantite' });
    if (!brouillon.motif.trim()) return setBrouillon({ ...brouillon, erreur: 'erreurMotif' });
    await agir(async () => {
      await actions.ajouterMouvement({
        type: brouillon.type,
        produit: brouillon.produit,
        quantite,
        motif: brouillon.motif.trim(),
      });
      setBrouillon({ ...brouillon, quantite: '', motif: '', erreur: '' });
      afficher(t('comptoir.session.mouvements.toastAjoute'));
    });
  };

  const naviguerEntreOnglets = (evenement: KeyboardEvent<HTMLButtonElement>) => {
    const decalage = evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    if (!decalage) return;
    const suivant = ONGLETS[(ONGLETS.indexOf(onglet) + decalage + ONGLETS.length) % ONGLETS.length];
    if (!suivant) return;
    evenement.preventDefault();
    choisirOnglet(suivant);
    requestAnimationFrame(() => document.getElementById(`onglet-session-${suivant}`)?.focus());
  };

  const demandeOuverte =
    fenetre?.type === 'autorisation'
      ? instantane.demandes.find((d) => d.id === fenetre.demandeId)
      : undefined;
  const bonOuvert =
    fenetre?.type === 'bon'
      ? instantane.livraisons.find((l) => l.id === fenetre.livraisonId)
      : undefined;

  return (
    <>
      <EnTetePage
        kicker={kicker}
        titre={t('titres.session', { session: nomSession, date })}
        session={{ creneau: session.type, ouverte: Boolean(ouverte) }}
      />
      <div className={styles.page}>
        {bandeau && (
          <output className={styles.bandeau}>
            <div className={styles.bandeauTexte}>{bandeau}</div>
            <div className={styles.bandeauActions}>
              {peutRouvrir && (
                <button
                  type="button"
                  className={styles.rouvrir}
                  onClick={() => setFenetre({ type: 'reouverture' })}
                >
                  {t('comptoir.session.bandeau.rouvrir')}
                </button>
              )}
              {peutOuvrirLaSuivante && (
                <button
                  type="button"
                  className={styles.ouvrirSuivante}
                  onClick={() =>
                    void agir(async () => {
                      await actions.ouvrirSuivante();
                      choisirOnglet('commandes');
                      afficher(t('comptoir.session.cloture.toastOuverte'));
                    })
                  }
                >
                  {t('comptoir.session.bandeau.ouvrirSuivante', {
                    type: t(`creneau.${suivante}Court`).toLowerCase(),
                    date: dateSuivante,
                  })}
                </button>
              )}
            </div>
          </output>
        )}

        <div className={styles.onglets} role="tablist" aria-label={t('comptoir.session.sections')}>
          {ONGLETS.map((cle) => (
            <button
              type="button"
              key={cle}
              id={`onglet-session-${cle}`}
              role="tab"
              aria-selected={onglet === cle}
              aria-controls="panneau-session"
              tabIndex={onglet === cle ? 0 : -1}
              className={`${styles.onglet} ${onglet === cle ? styles.ongletActif : ''}`}
              onClick={() => choisirOnglet(cle)}
              onKeyDown={naviguerEntreOnglets}
            >
              {t(`comptoir.session.onglets.${cle}`)}
            </button>
          ))}
        </div>

        <div
          className={styles.panneau}
          id="panneau-session"
          role="tabpanel"
          aria-labelledby={`onglet-session-${onglet}`}
        >
          {onglet === 'commandes' && (
            <Commandes
              instantane={instantane}
              actions={actions}
              peutSaisir={Boolean(peutSaisir)}
              peutRelancer={Boolean(peutRelancer)}
              peutVoirLePlan={profil !== 'caissier'}
              onVoirLePlan={() => void navigate('/atelier/production')}
              afficher={afficher}
            />
          )}
          {onglet === 'livraisons' && (
            <Livraisons
              instantane={instantane}
              formulaire={livraison}
              champs={champs}
              peutSaisir={Boolean(peutLivrer)}
              peutAutoriser={direction}
              langue={langue}
              onOuvrirBon={(livraisonId) => setFenetre({ type: 'bon', livraisonId })}
              onSaisirCodeGerant={(demandeId) => setFenetre({ type: 'autorisation', demandeId })}
            />
          )}
          {onglet === 'mouvements' && (
            <Mouvements
              instantane={instantane}
              brouillon={brouillon}
              onChange={setBrouillon}
              onAjouter={() => void ajouterMouvement()}
              peutSaisir={Boolean(peutMouvementer)}
            />
          )}
          {onglet === 'cloture' && (
            <Cloture
              instantane={instantane}
              actions={actions}
              verrouille={!peutCloturer}
              peutCloturer={Boolean(peutCloturer)}
              onDemanderCloture={() => setFenetre({ type: 'cloture' })}
            />
          )}
        </div>
      </div>

      {demandeOuverte && (
        <ModaleAutorisation
          demande={demandeOuverte}
          actions={actions}
          onFermer={() => setFenetre(null)}
          onDecision={(accord, decidee) => {
            setFenetre(null);
            afficher(
              t(
                accord
                  ? 'comptoir.session.modales.autorisation.accorde'
                  : 'comptoir.session.modales.autorisation.refuse',
                { client: decidee.clientNom },
              ),
            );
          }}
        />
      )}
      {bonOuvert && (
        <ModaleBon
          livraison={bonOuvert}
          session={session}
          echeanceDettes={instantane.echeanceDettes}
          onFermer={() => setFenetre(null)}
        />
      )}
      {fenetre?.type === 'reouverture' && (
        <FenetreReouverture
          caisse={t('comptoir.caisses.reouverture.caisse', { session: nomSession, jour: date })}
          erreur={erreurReouverture}
          envoiEnCours={reouvertureEnCours}
          onFermer={() => setFenetre(null)}
          onConfirmer={(motif) => {
            setReouvertureEnCours(true);
            setErreurReouverture(null);
            actions
              .rouvrir(motif)
              .then(() => {
                setFenetre(null);
                afficher(t('comptoir.caisses.reouverture.fait'));
              })
              .catch((erreur: unknown) =>
                setErreurReouverture(
                  erreur instanceof Error ? erreur.message : t('comptoir.session.erreurs.defaut'),
                ),
              )
              .finally(() => setReouvertureEnCours(false));
          }}
        />
      )}
      {fenetre?.type === 'cloture' && (
        <ModaleCloture
          instantane={instantane}
          onFermer={() => setFenetre(null)}
          onConfirmer={() =>
            void agir(async () => {
              await actions.cloturer();
              setFenetre(null);
              afficher(t('comptoir.session.cloture.toastCloturee'));
            })
          }
        />
      )}
    </>
  );
}
