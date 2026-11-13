import { ErreurApi } from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { useContexte } from '@/coque/contexte.ts';
import { EcranErreur, EnTetePage, useToast } from '@/ui';
import { formaterDateCourte, formaterNombre, formaterNombreSigne, initiales } from '@/utils';
import { useState } from 'react';

import { cleTitre, type Ecran } from '../../../navigation.ts';
import {
  useCaisses,
  useFermerCaisse,
  useOuvrirCaisse,
  useRemettreAuCoffre,
  useRouvrirCaisse,
} from './api.ts';
import styles from './Caisses.module.css';
import { FenetreCoffre } from './FenetreCoffre.tsx';
import { FenetreFermeture } from './FenetreFermeture.tsx';
import { FenetreOuverture } from './FenetreOuverture.tsx';
import { FenetreReouverture } from './FenetreReouverture.tsx';
import { jourAvecSemaine, jourCourt } from './formats.ts';
import {
  cartesVisibles,
  depassePlafond,
  droitsCaisse,
  ecartDeCaisse,
  lignesDuTableau,
  statutDeSession,
  syntheseCaissiere,
  type NiveauStatutCaisse,
} from './regles.ts';
import type { SessionCaisse } from './types.ts';

type Fenetre = 'ouverture' | 'fermeture' | 'coffre' | 'reouverture' | null;

const CLASSE_STATUT: Record<NiveauStatutCaisse, string> = {
  ok: styles.statutOk!,
  bloquant: styles.statutBloquant!,
  surveiller: styles.statutSurveiller!,
};

const CLASSE_ECART: Record<NiveauStatutCaisse, string> = {
  ok: styles.ecartOk!,
  bloquant: styles.ecartBloquant!,
  surveiller: styles.ecartSurveiller!,
};

const COLONNES = [
  'jour',
  'session',
  'caissiere',
  'ouverture',
  'fermeture',
  'fonds',
  'attendu',
  'compte',
  'ecart',
  'statut',
] as const;

/**
 * Comptoir › Caisses : ouvertures et fermetures de caisse (US-040 à US-044), repris de la maquette
 * « OptiBoul ERP v2 ». La caissière voit ses caisses ; le gérant et le propriétaire voient tout.
 */
export default function EcranCaisses({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const afficherToast = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const { data: contexte } = useContexte();
  const requete = useCaisses(utilisateur?.name);
  const ouvrir = useOuvrirCaisse(utilisateur?.name);
  const fermer = useFermerCaisse(utilisateur?.name);
  const rouvrir = useRouvrirCaisse(utilisateur?.name);
  const remettre = useRemettreAuCoffre(utilisateur?.name);
  const [filtre, setFiltre] = useState('all');
  const [fenetre, setFenetre] = useState<Fenetre>(null);

  const formatDate = (iso: string) => formaterDateCourte(new Date(iso), langue);
  const semaine = contexte
    ? t('coque.semaine', {
        numero: contexte.semaine.numero,
        du: formatDate(contexte.semaine.du),
        au: formatDate(contexte.semaine.au),
      })
    : '';
  const kicker = contexte
    ? t('coque.kickerSemaine', {
        numero: contexte.semaine.numero,
        du: formatDate(contexte.semaine.du),
        au: formatDate(contexte.semaine.au),
        gerant: contexte.gerantDeLaSemaine,
        production: contexte.responsableProduction,
      })
    : undefined;
  const entete = <EnTetePage kicker={kicker} titre={t(cleTitre(ecran))} />;

  const reponse = requete.data;
  if (!reponse) {
    if (requete.isError) {
      return (
        <>
          {entete}
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('comptoir.caisses.erreur')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        </>
      );
    }
    return (
      <>
        {entete}
        <output className={styles.attente}>{t('comptoir.caisses.chargement')}</output>
      </>
    );
  }

  const { caisseOuverte, detail, prochaine, plafond } = reponse;
  const droits = droitsCaisse(utilisateur?.profil, caisseOuverte?.caissiere.id === reponse.moi);
  const filtreActif = droits.voitToutes ? filtre : 'all';
  const lignes = lignesDuTableau(reponse.sessions, filtreActif);
  const cartes = cartesVisibles(reponse.caissieres, droits, reponse.moi).map((c) =>
    syntheseCaissiere(c, reponse.sessions),
  );
  const proposerCoffre = Boolean(
    detail && droits.remettreAuCoffre && depassePlafond(detail.attendu, plafond),
  );
  const derniereFermee = reponse.sessions.at(-1);

  const nomSession = (type: 'jour' | 'nuit') =>
    t(type === 'nuit' ? 'comptoir.caisses.sessionNuit' : 'comptoir.caisses.sessionJour');
  const montrer = (nom: Fenetre) => {
    ouvrir.reset();
    fermer.reset();
    rouvrir.reset();
    remettre.reset();
    setFenetre(nom);
  };
  const messageErreur = (erreur: unknown) =>
    !erreur
      ? null
      : erreur instanceof ErreurApi
        ? // Le code métier de l'API donne le texte traduit ; à défaut, le message du serveur.
          t(`comptoir.caisses.erreurs.${erreur.code}`, { defaultValue: erreur.message })
        : t('comptoir.caisses.echec');
  const termine = (message: string) => {
    setFenetre(null);
    afficherToast(message);
  };

  const libelleStatut = (s: SessionCaisse) =>
    t(`comptoir.caisses.statuts.${statutDeSession(s).cle}`);

  return (
    <>
      {entete}
      <div className={styles.page}>
        <div className={styles.barre}>
          {droits.voitToutes && (
            <fieldset className={styles.filtres} aria-label={t('comptoir.caisses.filtre')}>
              {[{ id: 'all', nom: t('comptoir.caisses.toutes') }, ...reponse.caissieres].map(
                (choix) => (
                  <button
                    key={choix.id}
                    type="button"
                    className={`${styles.filtre} ${filtreActif === choix.id ? styles.filtreActif : ''}`}
                    aria-pressed={filtreActif === choix.id}
                    onClick={() => setFiltre(choix.id)}
                  >
                    {choix.nom}
                  </button>
                ),
              )}
            </fieldset>
          )}
          {caisseOuverte && (
            <div className={styles.ouverte}>
              <output className={styles.ouverteTexte}>
                {t('comptoir.caisses.ouverte', {
                  session: nomSession(caisseOuverte.type),
                  jour: jourCourt(caisseOuverte.jour, langue),
                  nom: caisseOuverte.caissiere.nom,
                  heure: caisseOuverte.ouverture.heure,
                })}
              </output>
              {proposerCoffre && detail && (
                <>
                  <span className={styles.plafond}>
                    {t('comptoir.caisses.plafondDepasse', { plafond: formaterNombre(plafond) })}
                  </span>
                  <button type="button" className={styles.fermer} onClick={() => montrer('coffre')}>
                    {t('comptoir.caisses.remettre')}
                  </button>
                </>
              )}
              {droits.fermer && (
                <button
                  type="button"
                  className={styles.fermer}
                  onClick={() => montrer('fermeture')}
                >
                  {t('comptoir.caisses.fermer')}
                </button>
              )}
            </div>
          )}
          {!caisseOuverte && (droits.ouvrir || (droits.rouvrir && reponse.rouvrable)) && (
            <div className={styles.groupe}>
              {droits.rouvrir && reponse.rouvrable && (
                <button
                  type="button"
                  className={styles.rouvrir}
                  onClick={() => montrer('reouverture')}
                >
                  {t('comptoir.caisses.rouvrir')}
                </button>
              )}
              {droits.ouvrir && (
                <button
                  type="button"
                  className={styles.ouvrir}
                  onClick={() => montrer('ouverture')}
                >
                  {t('comptoir.caisses.ouvrir', {
                    type: t(
                      prochaine.type === 'nuit'
                        ? 'comptoir.caisses.typeNuit'
                        : 'comptoir.caisses.typeJour',
                    ),
                    jour: jourCourt(prochaine.jour, langue),
                  })}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.cartes}>
          {cartes.map((carte) => {
            const contenu = (
              <>
                <span className={styles.identite}>
                  <span className={styles.avatar} aria-hidden>
                    {initiales(carte.personne.nom)}
                  </span>
                  <span className={styles.noms}>
                    <span className={styles.nom}>{carte.personne.nom}</span>
                    <span className={styles.sessions}>
                      {t('comptoir.caisses.resume', {
                        ouvertures: carte.ouvertures,
                        fermetures: carte.fermetures,
                      })}
                    </span>
                  </span>
                </span>
                <span className={styles.ligneCarte}>
                  <span className={styles.libelleCarte}>{t('comptoir.caisses.recette')}</span>
                  <span
                    className={styles.valeurCarte}
                  >{`${formaterNombre(carte.recette)} FCFA`}</span>
                </span>
                <span className={styles.ligneCarte}>
                  <span className={styles.libelleCarte}>{t('comptoir.caisses.ecartCumule')}</span>
                  <span
                    className={`${styles.valeurCarte} ${carte.ecart === 0 ? styles.ecartOk : carte.ecart < 0 ? styles.ecartBloquant : styles.ecartSurveiller}`}
                  >
                    {`${formaterNombreSigne(carte.ecart)} FCFA`}
                  </span>
                </span>
                <span className={styles.derniere}>
                  {carte.derniere
                    ? t('comptoir.caisses.derniere', {
                        jour: jourAvecSemaine(carte.derniere.jour, langue),
                        heure: carte.derniere.ouverture.heure,
                      })
                    : ''}
                </span>
              </>
            );
            const choisie = filtreActif === carte.personne.id;
            const classe = `${styles.carte} ${choisie ? styles.carteActive : ''}`;
            // La direction touche une carte pour filtrer le tableau ; la caissière n'a que la sienne.
            return droits.voitToutes ? (
              <button
                key={carte.personne.id}
                type="button"
                className={classe}
                aria-pressed={choisie}
                onClick={() => setFiltre(choisie ? 'all' : carte.personne.id)}
              >
                {contenu}
              </button>
            ) : (
              <div key={carte.personne.id} className={classe}>
                {contenu}
              </div>
            );
          })}
        </div>

        <section className={styles.cadre} aria-label={t('comptoir.caisses.tableau')}>
          <div className={styles.large}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.entete}>
                  {COLONNES.map((colonne) => (
                    <th key={colonne} scope="col">
                      {t(`comptoir.caisses.colonnes.${colonne}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((s) => {
                  const { niveau } = statutDeSession(s);
                  const ecart = ecartDeCaisse(s.attendu, s.compte ?? s.attendu);
                  return (
                    <tr key={s.id} className={styles.ligne}>
                      <th scope="row" className={styles.jour}>
                        {jourAvecSemaine(s.jour, langue)}
                      </th>
                      <td>
                        {t(s.type === 'nuit' ? 'comptoir.caisses.nuit' : 'comptoir.caisses.jour')}
                      </td>
                      <td className={styles.caissiere}>{s.caissiere.nom}</td>
                      <td>{`${s.ouverture.heure} · ${s.ouverture.par}`}</td>
                      <td>
                        {s.fermeture
                          ? `${s.fermeture.heure} · ${s.fermeture.par}`
                          : t('comptoir.caisses.enCours')}
                      </td>
                      <td>{formaterNombre(s.fonds)}</td>
                      <td>{formaterNombre(s.attendu)}</td>
                      <td>{s.enCours ? '—' : formaterNombre(s.compte ?? 0)}</td>
                      <td
                        className={`${styles.ecart} ${s.enCours ? styles.ecartNeutre : CLASSE_ECART[niveau]}`}
                      >
                        {s.enCours ? '—' : formaterNombreSigne(ecart)}
                      </td>
                      <td className={`${styles.statut} ${CLASSE_STATUT[niveau]}`}>
                        {libelleStatut(s)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lignes.length === 0 && (
              <div className={styles.vide}>{t('comptoir.caisses.aucune')}</div>
            )}
          </div>
        </section>

        <div className={styles.regle}>{t('comptoir.caisses.regle')}</div>
      </div>

      {fenetre === 'ouverture' && utilisateur && (
        <FenetreOuverture
          prochaine={prochaine}
          moi={{ id: reponse.moi, nom: utilisateur.name ?? '' }}
          semaine={semaine}
          erreur={messageErreur(ouvrir.error)}
          envoiEnCours={ouvrir.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={(fonds) =>
            ouvrir.mutate(
              { fonds },
              {
                onSuccess: () =>
                  termine(t('comptoir.caisses.ouverture.fait', { fonds: formaterNombre(fonds) })),
              },
            )
          }
        />
      )}
      {fenetre === 'fermeture' && detail && (
        <FenetreFermeture
          detail={detail}
          erreur={messageErreur(fermer.error)}
          envoiEnCours={fermer.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={(compte) =>
            fermer.mutate(
              { compte },
              { onSuccess: () => termine(t('comptoir.caisses.fermeture.fait')) },
            )
          }
        />
      )}
      {fenetre === 'coffre' && detail && (
        <FenetreCoffre
          detail={detail}
          plafond={plafond}
          receveurs={reponse.receveurs}
          erreur={messageErreur(remettre.error)}
          envoiEnCours={remettre.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={(montant, receveur) =>
            remettre.mutate(
              { montant, receveur },
              {
                onSuccess: (resultat) =>
                  termine(
                    t('comptoir.caisses.coffre.fait', {
                      montant: formaterNombre(montant),
                      nom: resultat?.receveur ?? '',
                    }),
                  ),
              },
            )
          }
        />
      )}
      {fenetre === 'reouverture' && (
        <FenetreReouverture
          caisse={
            derniereFermee
              ? t('comptoir.caisses.reouverture.caisse', {
                  session: nomSession(derniereFermee.type),
                  jour: jourCourt(derniereFermee.jour, langue),
                })
              : ''
          }
          erreur={messageErreur(rouvrir.error)}
          envoiEnCours={rouvrir.isPending}
          onFermer={() => setFenetre(null)}
          onConfirmer={(motif) =>
            rouvrir.mutate(
              { motif },
              { onSuccess: () => termine(t('comptoir.caisses.reouverture.fait')) },
            )
          }
        />
      )}
    </>
  );
}
