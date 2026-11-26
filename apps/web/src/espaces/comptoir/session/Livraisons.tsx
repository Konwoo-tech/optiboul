import { useTranslation } from '@/i18n';
import type { NiveauStatut } from '@/utils';
import type { CSSProperties } from 'react';

import { dateCourte, libelleDuMode, nomDeSession } from './affichage.ts';
import {
  formaterNombre,
  formaterSigne,
  lireEntier,
  niveauDuSolde,
  texteHabituel,
  totauxDesLivraisons,
} from './calculs.ts';
import { CommeCommande } from './CommeCommande.tsx';
import styles from './Livraisons.module.css';
import type { ChampsLivraison, FormulaireLivraison } from './useFormulaireLivraison.ts';
import { MODES_PAIEMENT, type InstantaneSession } from './types.ts';

type Props = {
  instantane: InstantaneSession;
  formulaire: FormulaireLivraison;
  champs: ChampsLivraison;
  /** Caissier ou gérant, session ouverte. */
  peutSaisir: boolean;
  onOuvrirBon: (livraisonId: string) => void;
  /** Rouvre la fenêtre du code du gérant pour une demande déjà envoyée. */
  onSaisirCodeGerant: (demandeId: string) => void;
  /** Le profil connecté est le gérant ou le propriétaire : il autorise lui-même. */
  peutAutoriser: boolean;
  langue: string;
};

const couleurDe = (niveau: NiveauStatut): CSSProperties => ({ color: `var(--ob-${niveau}-texte)` });

/** Onglet « Livraisons » : recherche d'un client, saisie, encaissement, dernières livraisons. */
export function Livraisons({
  instantane,
  formulaire: lv,
  champs,
  peutSaisir,
  onOuvrirBon,
  onSaisirCodeGerant,
  peutAutoriser,
  langue,
}: Props) {
  const { t } = useTranslation();
  const { plafond, livraisons, session, dernierBon } = instantane;
  const { client, calcul, formulaire } = lv;
  const { recherche: refRecherche, quantites: refsQuantites, recu: refRecu } = champs;
  const totaux = totauxDesLivraisons(livraisons);
  const dejaLivres = new Set(livraisons.map((l) => l.clientId));
  const commande = client ? instantane.commandes[client.id] : undefined;
  const commandeDuClient =
    client && commande && !dejaLivres.has(client.id)
      ? texteHabituel({
          BAG: lireEntier(commande.BAG),
          KO: lireEntier(commande.KO),
          GC: lireEntier(commande.GC),
        })
      : '';

  const niveauApres = niveauDuSolde(calcul.soldeApres, plafond);
  const motSolde =
    niveauApres === 'bloquant'
      ? t('comptoir.session.livraisons.plafondDepasseCourt')
      : niveauApres === 'surveiller'
        ? t('comptoir.session.livraisons.dette')
        : t('comptoir.session.livraisons.aJour');
  const motReste =
    calcul.reste < 0
      ? t('comptoir.session.livraisons.devientDette')
      : calcul.reste > 0
        ? t('comptoir.session.livraisons.rembourse')
        : t('comptoir.session.livraisons.payeExactement');
  const couleurReste: CSSProperties =
    calcul.reste < 0
      ? couleurDe('surveiller')
      : calcul.reste > 0
        ? couleurDe('ok')
        : { color: 'var(--ob-encre)' };

  // Pourquoi « Valider » est refusé, quand l'écran le dit : lu avec le bouton par les lecteurs d'écran.
  const raisonDuRefus = calcul.bloquee
    ? 'raison-blocage'
    : calcul.referenceManquante && calcul.du > 0
      ? 'erreur-reference'
      : undefined;

  const ouverte = session.statut === 'ouverte';
  const nomSession = nomDeSession(t, session.type);
  const titreSession = t('titres.session', {
    session: nomSession,
    date: dateCourte(session.date, langue),
  });

  const stats: { libelle: string; valeur: string; couleur?: CSSProperties }[] = [
    {
      libelle: t('comptoir.session.livraisons.stats.livraisons'),
      valeur: String(livraisons.length),
    },
    { libelle: t('comptoir.session.livraisons.stats.pains'), valeur: formaterNombre(totaux.pains) },
    { libelle: t('comptoir.session.livraisons.stats.recette'), valeur: formaterNombre(totaux.du) },
    {
      libelle: t('comptoir.session.livraisons.stats.encaisse'),
      valeur: formaterNombre(totaux.recu),
    },
    {
      libelle: t('comptoir.session.livraisons.stats.dettes'),
      valeur: formaterNombre(totaux.dette),
      couleur: couleurDe('surveiller'),
    },
    {
      libelle: t('comptoir.session.livraisons.stats.remboursements'),
      valeur: formaterNombre(totaux.remboursements),
      couleur: couleurDe('ok'),
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.clients}>
        <input
          ref={refRecherche}
          className={styles.recherche}
          value={lv.recherche}
          onChange={(e) => lv.setRecherche(e.target.value)}
          onKeyDown={(e) => {
            const premier = lv.clientsFiltres[0];
            if (e.key === 'Enter' && premier) {
              e.preventDefault();
              lv.selectionner(premier.id);
            }
          }}
          placeholder={t('comptoir.session.livraisons.recherche')}
          aria-label={t('comptoir.session.livraisons.rechercheEtiquette')}
        />
        <div className={styles.liste}>
          {lv.clientsFiltres.map((candidat) => {
            const choisi = candidat.id === formulaire.clientId;
            return (
              <button
                type="button"
                key={candidat.id}
                className={`${styles.client} ${choisi ? styles.clientChoisi : ''}`}
                aria-pressed={choisi}
                onClick={() => lv.selectionner(candidat.id)}
              >
                <span className={styles.clientTextes}>
                  <span className={styles.clientNom}>{candidat.nom}</span>
                  <span className={styles.clientLieu}>
                    {dejaLivres.has(candidat.id)
                      ? t('comptoir.session.livraisons.dejaLivre', { lieu: candidat.lieu })
                      : candidat.lieu}
                  </span>
                </span>
                <span
                  className={styles.clientSolde}
                  style={couleurDe(niveauDuSolde(candidat.solde, plafond))}
                >
                  {candidat.solde < 0
                    ? formaterNombre(candidat.solde)
                    : t('comptoir.session.livraisons.aJour')}
                </span>
              </button>
            );
          })}
          {lv.clientsFiltres.length === 0 && (
            <div className={styles.aucunClient}>
              {t('comptoir.session.livraisons.aucunClient', { recherche: lv.recherche })}
            </div>
          )}
        </div>
      </div>

      <div className={styles.livraison}>
        {!peutSaisir && (
          <div className={styles.lectureSeule}>
            {ouverte
              ? t('comptoir.session.livraisons.lectureSeule')
              : t('comptoir.session.livraisons.verrouillee')}
          </div>
        )}
        {peutSaisir && !client && (
          <div className={styles.vide}>
            <div className={styles.videTitre}>{t('comptoir.session.livraisons.aucuneTitre')}</div>
            <div className={styles.videSous}>{t('comptoir.session.livraisons.aucuneSous')}</div>
          </div>
        )}
        {peutSaisir && client && (
          <>
            <div className={styles.entete}>
              <div>
                <div className={styles.nom}>{client.nom}</div>
                <div className={styles.sousNom}>
                  {`${client.type} · ${client.lieu} · ${client.telephone}`}
                </div>
              </div>
              <div className={styles.soldeActuel}>
                <div className={styles.soldeLibelle}>
                  {t('comptoir.session.livraisons.soldeActuel')}
                </div>
                <div
                  className={styles.soldeValeur}
                  style={couleurDe(niveauDuSolde(client.solde, plafond))}
                >
                  {formaterNombre(client.solde)} FCFA
                </div>
              </div>
            </div>

            {commandeDuClient && peutSaisir && (
              <CommeCommande
                clientId={client.id}
                commande={commandeDuClient}
                occupe={false}
                onLivrer={() => void lv.livrerCommeCommande()}
              />
            )}

            <div className={styles.quantites}>
              {calcul.lignes.map((ligne) => (
                <label className={styles.etiquetteQuantite} key={ligne.cle}>
                  <span className={styles.etiquetteHaut}>
                    <span>{ligne.libelle}</span>
                    <span className={styles.prix}>{formaterNombre(ligne.prix)} F</span>
                  </span>
                  <input
                    ref={refsQuantites[ligne.cle]}
                    className={styles.quantite}
                    value={formulaire.saisies[ligne.cle]}
                    onChange={(e) => lv.saisirQuantite(ligne.cle, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      lv.passerAuSuivant(ligne.cle);
                    }}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={t('comptoir.session.livraisons.quantite', {
                      produit: ligne.libelle,
                    })}
                  />
                  <span className={styles.sousTotal}>{formaterNombre(ligne.total)} FCFA</span>
                </label>
              ))}
            </div>

            <div className={styles.du}>
              <span className={styles.duLibelle}>{t('comptoir.session.livraisons.montantDu')}</span>
              <span className={styles.duMontant}>
                {formaterNombre(calcul.du)} <span className={styles.duUnite}>FCFA</span>
              </span>
            </div>

            <div className={styles.modes}>
              <span className={styles.modesLibelle}>
                {t('comptoir.session.livraisons.modePaiement')}
              </span>
              <div className={styles.modesBoutons}>
                {MODES_PAIEMENT.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={`${styles.mode} ${formulaire.mode === mode ? styles.modeChoisi : ''}`}
                    aria-pressed={formulaire.mode === mode}
                    onClick={() => lv.definirMode(mode)}
                  >
                    {libelleDuMode(t, mode)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.paiement}>
              <label className={styles.etiquette}>
                {t('comptoir.session.livraisons.recu')}
                <div className={styles.recuLigne}>
                  <input
                    ref={refRecu}
                    className={styles.recu}
                    value={formulaire.recu}
                    onChange={(e) => lv.saisirRecu(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      void lv.valider();
                    }}
                    inputMode="numeric"
                    placeholder="0"
                  />
                  <button type="button" className={styles.exact} onClick={lv.recuExact}>
                    {t('comptoir.session.livraisons.exact')}
                  </button>
                </div>
              </label>
              {formulaire.mode !== 'especes' && (
                <label className={styles.etiquette}>
                  {t('comptoir.session.livraisons.reference')}
                  <input
                    className={`${styles.reference} ${calcul.referenceManquante && calcul.du > 0 ? styles.referenceErreur : ''}`}
                    value={formulaire.reference}
                    onChange={(e) => lv.saisirReference(e.target.value)}
                    placeholder="MP241014.2150.C7"
                  />
                  <span className={styles.erreur} id="erreur-reference">
                    {calcul.referenceManquante && calcul.du > 0
                      ? t('comptoir.session.livraisons.referenceObligatoire')
                      : ''}
                  </span>
                </label>
              )}
            </div>

            <div className={styles.resultats}>
              <div className={styles.resultat}>
                <span className={styles.resultatLibelle}>
                  {t('comptoir.session.livraisons.reste')}
                </span>
                <span className={styles.resultatValeur} style={couleurReste}>
                  {`${formaterSigne(calcul.reste)} FCFA`}
                </span>
                <span className={styles.resultatMot}>{motReste}</span>
              </div>
              <div className={styles.resultat}>
                <span className={styles.resultatLibelle}>
                  {t('comptoir.session.livraisons.soldeApres')}
                </span>
                <span className={styles.resultatValeur} style={couleurDe(niveauApres)}>
                  {`${formaterNombre(calcul.soldeApres)} FCFA`}
                </span>
                <span
                  className={styles.resultatPastille}
                  style={{ background: `var(--ob-${niveauApres}-fond)`, ...couleurDe(niveauApres) }}
                >
                  {motSolde}
                </span>
              </div>
            </div>

            {calcul.bloquee && (
              <div className={styles.bloque} role="alert">
                <div className={styles.bloqueTitre}>
                  {t('comptoir.session.livraisons.plafondDepasse', {
                    plafond: formaterNombre(plafond),
                  })}
                </div>
                <div className={styles.bloqueTexte} id="raison-blocage">
                  {t('comptoir.session.livraisons.texteBloque', {
                    solde: formaterNombre(calcul.soldeApres),
                    manque: formaterNombre(calcul.manque),
                  })}
                </div>
                <div className={styles.bloqueActions}>
                  <button
                    type="button"
                    className={styles.encaisserPlus}
                    onClick={lv.recuComplement}
                  >
                    {t('comptoir.session.livraisons.encaisserPlus', {
                      manque: formaterNombre(calcul.manque),
                    })}
                  </button>
                  {lv.demandeEnAttente ? (
                    <button
                      type="button"
                      className={styles.autoriser}
                      onClick={() => onSaisirCodeGerant(lv.demandeEnAttente!.id)}
                    >
                      {t('comptoir.session.livraisons.codeGerant')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.autoriser}
                      onClick={() => void lv.demanderAutorisation()}
                    >
                      {peutAutoriser
                        ? t('comptoir.session.livraisons.autoriser')
                        : t('comptoir.session.livraisons.demanderAutorisation')}
                    </button>
                  )}
                </div>
                {lv.demandeEnAttente && (
                  <div className={styles.bloqueAttente}>
                    {t('comptoir.session.livraisons.enAttente', {
                      heure: lv.demandeEnAttente.heure,
                    })}
                  </div>
                )}
              </div>
            )}
            {calcul.depasse && !calcul.bloquee && lv.autorisation && (
              <div className={styles.autorise}>
                {t('comptoir.session.livraisons.autorise', {
                  par: lv.autorisation.par,
                  heure: lv.autorisation.heure,
                })}
              </div>
            )}
          </>
        )}
        {peutSaisir && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.bon}
              style={{ opacity: dernierBon ? 1 : 0.45 }}
              onClick={() => dernierBon && onOuvrirBon(dernierBon)}
            >
              {t('comptoir.session.livraisons.bon')}
            </button>
            <button
              type="button"
              className={`${styles.valider} ${calcul.valide ? styles.validerPret : ''}`}
              aria-disabled={!calcul.valide}
              aria-describedby={raisonDuRefus}
              onClick={() => void lv.valider()}
            >
              {calcul.paiementDeDette
                ? t('comptoir.session.livraisons.encaisserPaiement')
                : calcul.depasse && !calcul.bloquee
                  ? t('comptoir.session.livraisons.validerAutorisee')
                  : t('comptoir.session.livraisons.valider')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.droite}>
        <div className={styles.session}>
          <div className={styles.sessionTitre}>{titreSession}</div>
          <div className={styles.stats}>
            {stats.map((stat) => (
              <div key={stat.libelle}>
                <div className={styles.statLibelle}>{stat.libelle}</div>
                <div
                  className={styles.statValeur}
                  style={stat.couleur ?? { color: 'var(--ob-encre)' }}
                >
                  {stat.valeur}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.dernieres}>
          <div className={styles.dernieresTitre}>{t('comptoir.session.livraisons.dernieres')}</div>
          {livraisons.slice(0, 8).map((livraison) => (
            <div className={styles.derniere} key={livraison.id}>
              <div className={styles.derniereTextes}>
                <div className={styles.derniereNom}>{livraison.nom}</div>
                <div className={styles.derniereMeta}>
                  {t('comptoir.session.livraisons.meta', {
                    numero: livraison.numero,
                    heure: livraison.heure,
                    mode: libelleDuMode(t, livraison.mode),
                  })}
                </div>
              </div>
              <div className={styles.derniereMontants}>
                <div className={styles.derniereDu}>{formaterNombre(livraison.du)}</div>
                <div
                  className={styles.derniereReste}
                  style={couleurDe(livraison.reste < 0 ? 'surveiller' : 'ok')}
                >
                  {livraison.reste === 0
                    ? t('comptoir.session.livraisons.paye')
                    : formaterSigne(livraison.reste)}
                </div>
              </div>
              <button
                type="button"
                className={styles.derniereBon}
                aria-label={t('comptoir.session.livraisons.bonDe', { nom: livraison.nom })}
                onClick={() => onOuvrirBon(livraison.id)}
              >
                {t('comptoir.session.livraisons.bonCourt')}
              </button>
            </div>
          ))}
          {livraisons.length === 0 && (
            <div className={styles.aucuneLivraison}>
              {t('comptoir.session.livraisons.aucuneLivraison')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
