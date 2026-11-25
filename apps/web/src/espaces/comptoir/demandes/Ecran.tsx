import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { useToast } from '@/ui';
import { formaterDateCourte, formaterNombre } from '@/utils';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';

import { cheminEcran, ECRANS, type Ecran } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { formaterMois } from '../../gestion/personnel/affichage.ts';
import { codeErreur } from '../session/api.ts';
import { useDecider, useDemandes } from './api.ts';
import { FenetreRefus } from './FenetreRefus.tsx';
import styles from './Demandes.module.css';
import { codeDemande, destinationDe, peutDecider, repartir, validateurDe } from './regles.ts';
import type { Demande, ObjetLie } from './types.ts';

type Contexte = { gerant: string; proprietaire: string };

/**
 * Chemin de l'écran de l'objet lié, dans l'espace où le profil le trouve (celui de l'écran
 * ouvert d'abord). `null` quand le profil n'a pas cet écran : pas de lien qui mènerait nulle part.
 */
function cheminVers(
  objet: ObjetLie,
  profil: Profil | null | undefined,
  espaceOuvert: Ecran['espace'],
): string | null {
  const { ecran, recherche } = destinationDe(objet);
  const candidats = ECRANS.filter((e) => e.cle === ecran && profil && e.profils.includes(profil));
  const cible = candidats.find((e) => e.espace === espaceOuvert) ?? candidats[0];
  return cible ? `${cheminEcran(cible)}${recherche}` : null;
}

type LigneProps = {
  demande: Demande;
  contexte: Contexte;
  profil: Profil | null | undefined;
  espaceOuvert: Ecran['espace'];
  /** Présent pour une demande en attente que le profil peut trancher. */
  onDecider?: (accord: boolean) => void;
  occupe: boolean;
};

function LigneDemande({ demande, contexte, profil, espaceOuvert, onDecider, occupe }: LigneProps) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const titre = langue === 'en' && demande.titreEn ? demande.titreEn : demande.titre;
  const code = codeDemande(demande.numero);
  const enAttente = demande.statut === 'en-attente';
  const accordee = demande.statut === 'acceptee';
  const objet = demande.objet;
  const chemin = objet ? cheminVers(objet, profil, espaceOuvert) : null;
  const heureDeLaDecision = demande.decideA ?? '';

  let libelleLien = '';
  if (objet) {
    switch (objet.genre) {
      case 'client':
        libelleLien = t('demandes.lien.client', {
          nom: objet.nom,
          solde: formaterNombre(objet.solde),
        });
        break;
      case 'depense':
        libelleLien = t('demandes.lien.depense', {
          code: objet.code,
          montant: formaterNombre(objet.montant),
          semaine: objet.semaine,
        });
        break;
      case 'paie':
        libelleLien = t('demandes.lien.paie', { mois: formaterMois(objet.mois, langue) });
        break;
      case 'inventaire':
        libelleLien = t('demandes.lien.inventaire', { code: objet.code });
        break;
      case 'production':
        libelleLien = t('demandes.lien.production');
        break;
    }
  }

  const libelleAccord =
    demande.type === 'plafond' ? t('demandes.autoriser') : t('demandes.valider');
  const libelleRefus = t('demandes.refuser');

  return (
    <li className={styles.ligne} data-demande={demande.id}>
      <div className={styles.texte}>
        <span className={styles.entete}>
          <span className={styles.code}>{code}</span>
          {enAttente ? (
            <span
              className={styles.pastille}
              style={{
                background: 'var(--ob-surveiller-fond)',
                color: 'var(--ob-surveiller-texte)',
              }}
            >
              {t(`demandes.types.${demande.type}`)}
            </span>
          ) : (
            <span
              className={styles.pastille}
              style={{
                background: `var(--ob-${accordee ? 'ok' : 'bloquant'}-fond)`,
                color: `var(--ob-${accordee ? 'ok' : 'bloquant'}-texte)`,
              }}
            >
              {accordee ? t('demandes.accordee') : t('demandes.refusee')}
            </span>
          )}
        </span>
        <span className={styles.intitule}>{titre}</span>
        <span className={styles.detail}>
          {langue === 'en' && demande.detailEn ? demande.detailEn : demande.detail}
        </span>
        <span className={styles.meta}>
          {t('demandes.emisePar', {
            nom: demande.par,
            role: t(`profils.${demande.parProfil}`),
            date: `${formaterDateCourte(new Date(demande.jour), langue)} ${demande.heure}`,
          })}
        </span>
        {enAttente ? (
          <span className={styles.meta}>
            {t('demandes.aValiderPar', {
              qui: t(
                // Le serveur ne nomme pas le propriétaire : sans nom, pas de parenthèses vides.
                validateurDe(demande) === 'proprietaire' && !contexte.proprietaire
                  ? 'demandes.validateur.proprietaireSansNom'
                  : `demandes.validateur.${validateurDe(demande)}`,
                contexte,
              ),
            })}
          </span>
        ) : (
          <span className={styles.meta}>
            {t(accordee ? 'demandes.accordeePar' : 'demandes.refuseePar', {
              nom: demande.decidePar,
              heure: heureDeLaDecision,
            })}
          </span>
        )}
        {chemin && (
          <Link className={styles.lien} to={chemin}>
            {libelleLien}
            {' ›'}
          </Link>
        )}
      </div>
      {enAttente &&
        (onDecider ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.refuser}
              disabled={occupe}
              aria-label={t('demandes.actionSur', { action: libelleRefus, code })}
              onClick={() => onDecider(false)}
            >
              {libelleRefus}
            </button>
            <button
              type="button"
              className={styles.accorder}
              disabled={occupe}
              aria-label={t('demandes.actionSur', { action: libelleAccord, code })}
              onClick={() => onDecider(true)}
            >
              {libelleAccord}
            </button>
          </div>
        ) : (
          <span className={styles.attente}>{t('demandes.enAttente')}</span>
        ))}
    </li>
  );
}

type BlocProps = {
  idTitre: string;
  titre: string;
  vide: string;
  demandes: Demande[];
  titreRef?: RefObject<HTMLHeadingElement | null>;
  ligne: (demande: Demande) => ReactNode;
};

function Bloc({ idTitre, titre, vide, demandes, titreRef, ligne }: BlocProps) {
  return (
    <section className={styles.bloc} aria-labelledby={idTitre}>
      <h2 id={idTitre} ref={titreRef} tabIndex={-1} className={styles.titre}>
        {titre}
      </h2>
      {demandes.length > 0 ? (
        <ul className={styles.liste}>{demandes.map(ligne)}</ul>
      ) : (
        <p className={styles.vide}>{vide}</p>
      )}
    </section>
  );
}

/**
 * Comptoir › Demandes (US-070, US-071), repris de la maquette « OptiBoul ERP v2 » : les demandes
 * de validation en attente puis les décisions récentes, chacune rattachée à son objet. La
 * caissière ne voit que les siennes et ne décide pas ; le gérant et le propriétaire décident
 * selon le type (cahier des charges §5.9). Le même écran sert le comptoir et la gestion.
 */
export default function EcranDemandes({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const afficherToast = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const requete = useDemandes(utilisateur?.name);
  const decider = useDecider(utilisateur?.name);
  const titreEnAttente = useRef<HTMLHeadingElement>(null);
  // Sur le vrai serveur, un refus demande un motif : la demande à refuser attend dans cette fenêtre.
  const [refus, setRefus] = useState<Demande | null>(null);
  const profil = utilisateur?.profil;

  let contenu;
  if (requete.isError) {
    contenu = (
      <div className={styles.message} role="alert">
        {t('demandes.erreur')}
      </div>
    );
  } else if (requete.isPending) {
    contenu = <output className={styles.message}>{t('demandes.chargement')}</output>;
  } else {
    const { gerant, proprietaire, demandes } = requete.data;
    const contexte = { gerant, proprietaire };
    const { enAttente, decisions } = repartir(demandes);

    const trancher = (demande: Demande, accord: boolean, motif?: string) =>
      decider.mutate(
        { id: demande.id, accord, motif },
        {
          onSuccess: () => {
            setRefus(null);
            const titre = demande.titre;
            afficherToast(t(accord ? 'demandes.toastAccorde' : 'demandes.toastRefuse', { titre }));
            // La ligne quitte la liste : le focus revient au titre, il ne se perd pas dans la page.
            titreEnAttente.current?.focus();
          },
          onError: (erreur) =>
            afficherToast(
              t(
                ['deja_decidee', 'demande_deja_decidee'].includes(codeErreur(erreur) ?? '')
                  ? 'demandes.toastDejaDecidee'
                  : 'demandes.toastErreur',
              ),
            ),
        },
      );

    const ligne = (demande: Demande) => (
      <LigneDemande
        key={demande.id}
        demande={demande}
        contexte={contexte}
        profil={profil}
        espaceOuvert={ecran.espace}
        occupe={decider.isPending}
        onDecider={
          demande.statut === 'en-attente' && peutDecider(demande, profil)
            ? (accord) => (!accord ? setRefus(demande) : trancher(demande, accord))
            : undefined
        }
      />
    );

    contenu = (
      <div className={styles.ecran}>
        <p className={styles.regle}>{t('demandes.regle')}</p>
        <Bloc
          idTitre="demandes-en-attente"
          titre={t(profil === 'caissier' ? 'demandes.mesDemandesTitre' : 'demandes.enAttenteTitre')}
          vide={t('demandes.aucuneEnAttente')}
          demandes={enAttente}
          titreRef={titreEnAttente}
          ligne={ligne}
        />
        <Bloc
          idTitre="demandes-decisions"
          titre={t('demandes.decisionsTitre')}
          vide={t('demandes.aucuneDecision')}
          demandes={decisions}
          ligne={ligne}
        />
        {refus && (
          <FenetreRefus
            demande={`${codeDemande(refus.numero)} · ${refus.titre}`}
            envoiEnCours={decider.isPending}
            onFermer={() => setRefus(null)}
            onConfirmer={(motif) => trancher(refus, false, motif)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      {contenu}
    </>
  );
}
