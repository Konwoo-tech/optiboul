import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast, afficherRefus, codeOuTexte } from '@/ui';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import {
  codeErreur,
  useActiver,
  useDebloquer,
  useChangerDeGroupe,
  useCreerUnGroupe,
  useModifierUnGroupe,
  useCreerUtilisateur,
  erreursDeChamps,
  useReinitialiserLeCode,
  useUtilisateurs,
} from './api.ts';
import { ListeUtilisateurs } from './ListeUtilisateurs.tsx';
import { ModaleGroupe } from './ModaleGroupe.tsx';
import { NouvelUtilisateur } from './NouvelUtilisateur.tsx';
import {
  aDesErreurs,
  DESCRIPTION_DE_GROUPE_MAX,
  NOM_DE_GROUPE_MAX,
  nomDuGroupe,
  normaliserEmail,
  validerNouvelUtilisateur,
} from './regles.ts';
import type {
  Canal,
  ErreursUtilisateur,
  Groupe,
  NouveauGroupe,
  NouvelUtilisateur as Brouillon,
  Utilisateur,
} from './types.ts';
import styles from './Utilisateurs.module.css';
import { VueGroupes } from './VueGroupes.tsx';

const ONGLETS = ['liste', 'groupes', 'nouveau'] as const;
type Onglet = (typeof ONGLETS)[number];

const BROUILLON_VIDE: Brouillon = {
  nom: '',
  email: '',
  telephone: '',
  groupe: '',
  canal: 'whatsapp' as Canal,
  invitation: true,
};

/** Onglets dont la vue est livrée ; les autres arrivent avec le lot suivant. */
const ONGLETS_LIVRES: readonly Onglet[] = ['liste', 'groupes', 'nouveau'];

/**
 * Gestion › Utilisateurs (US-020 à US-022), vue « Utilisateurs » : l'administrateur change un
 * utilisateur de groupe (ses droits changent aussitôt), réinitialise un code, désactive ou réactive
 * un compte. Les onglets Groupes et Nouvel utilisateur arrivent dans la PR suivante. L'enregistrement
 * des postes de confiance (US-022) n'est pas dans la maquette.
 */
export default function EcranUtilisateurs({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const requete = useUtilisateurs(nom);
  const changerDeGroupe = useChangerDeGroupe(nom);
  const reinitialiser = useReinitialiserLeCode(nom);
  const activer = useActiver(nom);
  const creerGroupe = useCreerUnGroupe(nom);
  const modifierGroupe = useModifierUnGroupe(nom);
  const [groupeEdite, setGroupeEdite] = useState<Groupe | null>(null);
  const creer = useCreerUtilisateur(nom);
  const debloquer = useDebloquer(nom);
  const [codesSecours, setCodesSecours] = useState<string[]>([]);
  const [parametres, setParametres] = useSearchParams();
  const [filtre, setFiltre] = useState('all');
  const [brouillon, setBrouillon] = useState<Brouillon>(BROUILLON_VIDE);
  const [erreurs, setErreurs] = useState<ErreursUtilisateur>({});
  const [creeId, setCreeId] = useState<string | null>(null);
  const [tentative, setTentative] = useState(0);
  // Garde synchrone : deux clics avant le rendu suivant ne lancent qu'une seule action.
  const enCours = useRef(false);

  const instantane = requete.data;
  const demande = parametres.get('onglet');
  const onglet: Onglet = ONGLETS_LIVRES.find((o) => o === demande) ?? 'liste';

  if (!instantane || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('gestion.utilisateurs.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const { utilisateurs, groupes, moi } = instantane;
  const cree = utilisateurs.find((u) => u.id === creeId) ?? null;
  const occupe = [changerDeGroupe, reinitialiser, activer, creerGroupe, creer, debloquer].some(
    (m) => m.isPending,
  );

  const choisirOnglet = (suivant: Onglet) =>
    setParametres(
      (actuels) => {
        const p = new URLSearchParams(actuels);
        if (suivant === 'liste') p.delete('onglet');
        else p.set('onglet', suivant);
        return p;
      },
      { replace: true },
    );

  /** Flèches, Début et Fin : parmi les onglets livrés seulement. */
  const naviguerEntreOnglets = (e: KeyboardEvent<HTMLButtonElement>) => {
    const rang = ONGLETS_LIVRES.indexOf(onglet);
    const dernier = ONGLETS_LIVRES.length - 1;
    const cible =
      e.key === 'ArrowRight'
        ? (rang + 1) % ONGLETS_LIVRES.length
        : e.key === 'ArrowLeft'
          ? (rang - 1 + ONGLETS_LIVRES.length) % ONGLETS_LIVRES.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? dernier
              : -1;
    if (cible < 0) return;
    e.preventDefault();
    const suivant = ONGLETS_LIVRES[cible]!;
    choisirOnglet(suivant);
    document.getElementById(`onglet-utilisateurs-${suivant}`)?.focus();
  };

  /** Lance une action en refusant toute autre tant qu'elle n'est pas terminée. */
  const exclusif = (action: (fin: () => void) => void) => {
    if (occupe || enCours.current) return;
    enCours.current = true;
    action(() => {
      enCours.current = false;
    });
  };

  /** Un refus du serveur (droit, compte propre, inconnu) : on le dit et on relit la liste. */
  const signaler = (erreur: unknown) => {
    const code = codeErreur(erreur);
    afficherRefus(
      afficher,
      t,
      erreur,
      code === 'droit_insuffisant'
        ? 'gestion.utilisateurs.toasts.droit'
        : code === 'compte_propre'
          ? 'gestion.utilisateurs.toasts.comptePropre'
          : code === 'groupe_existant'
            ? 'gestion.utilisateurs.groupes.erreurExiste'
            : code === 'dernier_administrateur'
              ? 'gestion.utilisateurs.toasts.dernierAdministrateur'
              : code === 'utilisateur_inconnu' || code === 'groupe_inconnu'
                ? 'gestion.utilisateurs.toasts.inconnu'
                : code
                  ? 'gestion.utilisateurs.toasts.impossible'
                  : 'gestion.utilisateurs.toasts.erreur',
    );
    void requete.refetch();
  };

  const surGroupe = (u: Utilisateur, groupeId: string) => {
    const groupe = groupes.find((g) => g.id === groupeId);
    if (!groupe) return;
    exclusif((fin) =>
      changerDeGroupe.mutate(
        { id: u.id, groupe: groupeId },
        {
          onSettled: fin,
          onSuccess: () =>
            afficher(
              t('gestion.utilisateurs.toasts.groupeChange', {
                nom: u.nom,
                groupe: nomDuGroupe(groupe, i18n.language),
                profil: t(`profils.${groupe.profil}`),
              }),
            ),
          onError: signaler,
        },
      ),
    );
  };

  const surReinitialiser = (u: Utilisateur) => {
    exclusif((fin) =>
      reinitialiser.mutate(
        { id: u.id },
        {
          onSettled: fin,
          onSuccess: () =>
            afficher(t('gestion.utilisateurs.toasts.codeReinitialise', { nom: u.nom })),
          onError: signaler,
        },
      ),
    );
  };

  const surDebloquer = (u: Utilisateur) =>
    exclusif((fin) =>
      debloquer.mutate(u.id, {
        onSettled: fin,
        onSuccess: () => afficher(t('gestion.utilisateurs.toasts.debloque', { nom: u.nom })),
        onError: signaler,
      }),
    );

  const surActiver = (u: Utilisateur) => {
    // Comme la maquette, l'état du compte se lit sur sa pastille : pas de message.
    exclusif((fin) =>
      activer.mutate({ id: u.id, actif: !u.actif }, { onSettled: fin, onError: signaler }),
    );
  };

  const surCreerGroupe = (groupe: NouveauGroupe) =>
    new Promise<string | null>((resoudre) => {
      if (occupe || enCours.current) return resoudre('');
      enCours.current = true;
      creerGroupe.mutate(groupe, {
        onSettled: () => {
          enCours.current = false;
        },
        onSuccess: () => {
          afficher(t('gestion.utilisateurs.toasts.groupeCree'));
          resoudre(null);
        },
        onError: (erreur) => {
          const code = codeErreur(erreur);
          const message =
            code === 'groupe_existant'
              ? t('gestion.utilisateurs.groupes.erreurExiste')
              : code === 'nom_obligatoire'
                ? t('gestion.utilisateurs.groupes.erreurNom')
                : code === 'nom_trop_long'
                  ? t('gestion.utilisateurs.groupes.erreurNomLong', { max: NOM_DE_GROUPE_MAX })
                  : code === 'description_trop_longue'
                    ? t('gestion.utilisateurs.groupes.erreurDescriptionLongue', {
                        max: DESCRIPTION_DE_GROUPE_MAX,
                      })
                    : '';
          // Une erreur de champ se lit sous le champ ; les autres passent par le message.
          if (!message) signaler(erreur);
          resoudre(message);
        },
      });
    });

  const surModifierGroupe = async (modification: NouveauGroupe): Promise<string | null> => {
    if (!groupeEdite) return 'defaut';
    try {
      await modifierGroupe.mutateAsync({ id: groupeEdite.id, groupe: modification });
      setGroupeEdite(null);
      afficher(t('gestion.utilisateurs.groupes.modifier.toast', { nom: modification.nom }));
      return null;
    } catch (erreur) {
      const code = codeErreur(erreur);
      return code === 'groupe_existant'
        ? 'existe'
        : code === 'nom_obligatoire'
          ? 'nom'
          : (codeOuTexte(erreur, () => false) ?? 'defaut');
    }
  };

  const nouveau = (groupe = '') => {
    setBrouillon({ ...BROUILLON_VIDE, groupe });
    setErreurs({});
    setCreeId(null);
    choisirOnglet('nouveau');
  };

  const surChamp = (champ: 'nom' | 'email' | 'telephone', valeur: string) => {
    setBrouillon((b) => ({ ...b, [champ]: valeur }));
    setErreurs((e) => ({ ...e, [champ]: undefined }));
  };

  const surCreer = () => {
    if (occupe || enCours.current) return;
    const trouvees = validerNouvelUtilisateur(
      { ...brouillon, nom: brouillon.nom.trim() },
      utilisateurs.map((u) => u.email),
      groupes.map((g) => g.id),
    );
    if (aDesErreurs(trouvees)) {
      setErreurs(trouvees);
      setTentative((n) => n + 1);
      return;
    }
    enCours.current = true;
    creer.mutate(
      { ...brouillon, nom: brouillon.nom.trim(), email: normaliserEmail(brouillon.email) },
      {
        onSettled: () => {
          enCours.current = false;
        },
        onSuccess: (reponse) => {
          setCreeId(reponse.utilisateur.id);
          setCodesSecours(reponse.codesSecours ?? []);
          afficher(t('gestion.utilisateurs.toasts.cree', { nom: reponse.utilisateur.nom }));
        },
        onError: (erreur) => {
          const champs = erreursDeChamps(erreur);
          if (aDesErreurs(champs)) {
            setErreurs(champs);
            setTentative((n) => n + 1);
          } else signaler(erreur);
        },
      },
    );
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <div className={styles.entete}>
          <div
            className={styles.onglets}
            role="tablist"
            aria-label={t('gestion.utilisateurs.sections')}
          >
            {ONGLETS.map((cle) => (
              <button
                type="button"
                key={cle}
                id={`onglet-utilisateurs-${cle}`}
                role="tab"
                aria-selected={onglet === cle}
                aria-disabled={ONGLETS_LIVRES.includes(cle) ? undefined : true}
                aria-controls={ONGLETS_LIVRES.includes(cle) ? 'panneau-utilisateurs' : undefined}
                tabIndex={onglet === cle ? 0 : -1}
                className={`${styles.onglet} ${onglet === cle ? styles.ongletActif : ''}`}
                onClick={() => ONGLETS_LIVRES.includes(cle) && choisirOnglet(cle)}
                onKeyDown={naviguerEntreOnglets}
              >
                {t(`gestion.utilisateurs.onglets.${cle}`, {
                  nombre: cle === 'liste' ? utilisateurs.length : groupes.length,
                })}
              </button>
            ))}
          </div>
          <button type="button" className={styles.principal} onClick={() => nouveau()}>
            + {t('gestion.utilisateurs.nouvelUtilisateur')}
          </button>
        </div>

        <div
          id="panneau-utilisateurs"
          role="tabpanel"
          aria-labelledby={`onglet-utilisateurs-${onglet}`}
          tabIndex={0}
          className={`${styles.page} ${styles.tabpanel}`}
        >
          {onglet === 'groupes' && (
            <VueGroupes
              groupes={groupes}
              utilisateurs={utilisateurs}
              occupe={occupe}
              onAjouterMembre={(g) => nouveau(g)}
              onCreer={surCreerGroupe}
              onModifier={(g) => setGroupeEdite(g)}
            />
          )}
          {onglet === 'nouveau' && (
            <NouvelUtilisateur
              brouillon={brouillon}
              erreurs={erreurs}
              groupes={groupes}
              utilisateurs={utilisateurs}
              cree={cree}
              codesSecours={codesSecours}
              occupe={occupe}
              tentative={tentative}
              onChamp={surChamp}
              onGroupe={(g) => {
                setBrouillon((b) => ({ ...b, groupe: g }));
                setErreurs((e) => ({ ...e, groupe: undefined }));
              }}
              onCanal={(canal) => setBrouillon((b) => ({ ...b, canal }))}
              onInvitation={() => setBrouillon((b) => ({ ...b, invitation: !b.invitation }))}
              onAnnuler={() => {
                setBrouillon(BROUILLON_VIDE);
                setErreurs({});
                choisirOnglet('liste');
              }}
              onCreer={surCreer}
              onVoirLaListe={() => {
                setFiltre(cree?.groupe ?? 'all');
                setBrouillon(BROUILLON_VIDE);
                setCreeId(null);
                choisirOnglet('liste');
              }}
              onAutre={() => {
                setBrouillon({ ...BROUILLON_VIDE, groupe: brouillon.groupe });
                setErreurs({});
                setCreeId(null);
              }}
            />
          )}
          {onglet === 'liste' && (
            <ListeUtilisateurs
              utilisateurs={utilisateurs}
              groupes={groupes}
              moi={moi}
              filtre={filtre}
              occupe={occupe}
              onFiltre={setFiltre}
              onGroupe={surGroupe}
              onReinitialiser={(u) => surReinitialiser(u)}
              onActiver={surActiver}
              peutActiver
              onDebloquer={surDebloquer}
            />
          )}
        </div>
      </div>
      {groupeEdite && (
        <ModaleGroupe
          groupe={groupeEdite}
          groupes={groupes}
          envoiEnCours={modifierGroupe.isPending}
          onFermer={() => setGroupeEdite(null)}
          onConfirmer={surModifierGroupe}
        />
      )}
    </>
  );
}
