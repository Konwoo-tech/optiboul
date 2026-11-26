import { useTranslation } from '@/i18n';
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';

import type { ActionsSession } from './api.ts';
import {
  chiffres,
  clientsSansCommande,
  formaterNombre,
  montantEstime,
  PRODUITS,
  planDeSacs,
  texteHabituel,
} from './calculs.ts';
import styles from './Commandes.module.css';
import { nomDeSession } from './affichage.ts';
import type { InstantaneSession } from './types.ts';

type Props = {
  instantane: InstantaneSession;
  actions: ActionsSession;
  /** Saisie permise : caissier ou gérant, session ouverte. */
  peutSaisir: boolean;
  /** Relances et reprise de l'habituel : session ouverte, caissier, gérant ou propriétaire. */
  peutRelancer: boolean;
  /** Le plan de production est visible pour les profils autres que le caissier. */
  peutVoirLePlan: boolean;
  onVoirLePlan: () => void;
  afficher: (message: string) => void;
};

/** Onglet « Commandes » : une ligne par client, plan de sacs, relance des habituels. */
export function Commandes({
  instantane,
  actions,
  peutSaisir,
  peutRelancer,
  peutVoirLePlan,
  onVoirLePlan,
  afficher,
}: Props) {
  const { t } = useTranslation();
  const tableau = useRef<HTMLDivElement>(null);
  const { clients, commandes, habituelles, relances, session } = instantane;

  const sansCommande = clientsSansCommande(clients, commandes, habituelles);
  const plan = planDeSacs(clients, commandes);
  const total = clients.reduce((somme, c) => somme + montantEstime(c, commandes[c.id]), 0);
  const nomSession = nomDeSession(t, session.type).toLowerCase();

  const relancer = async (cibles: typeof clients) => {
    await actions.relancer(cibles.map((c) => c.id));
    afficher(
      cibles.length > 1
        ? t('comptoir.session.commandes.toasts.relancesEnvoyees', { count: cibles.length })
        : t('comptoir.session.commandes.toasts.relanceEnvoyee', { nom: cibles[0]?.nom }),
    );
  };

  const reprendre = async (nom: string, id: string) => {
    await actions.reprendreHabituelle(id);
    afficher(t('comptoir.session.commandes.toasts.commandeAjoutee', { nom }));
  };

  const annuler = async (nom: string, id: string) => {
    await actions.annulerCommande(id);
    afficher(t('comptoir.session.commandes.toasts.commandeAnnulee', { nom }));
  };

  const reprendreVeille = async () => {
    const { reprises } = await actions.reprendreVeille();
    afficher(
      reprises > 0
        ? t('comptoir.session.commandes.toasts.veilleReprise', { count: reprises })
        : t('comptoir.session.commandes.toasts.veilleVide'),
    );
  };

  /** Entrée passe au champ suivant du tableau (la ligne suivante après KO → GC). */
  const entreePasseAuSuivant = (evenement: KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    const champs = Array.from(
      tableau.current?.querySelectorAll<HTMLInputElement>('input:not(:disabled)') ?? [],
    );
    champs[champs.indexOf(evenement.currentTarget) + 1]?.focus();
  };

  const premier = sansCommande[0];

  return (
    <>
      {peutRelancer && sansCommande.length > 0 && premier && (
        <section className={styles.relance} aria-labelledby="titre-relance">
          <div className={styles.relanceEntete}>
            <div className={styles.relanceTextes}>
              <div className={styles.relanceTitre} id="titre-relance">
                {t('comptoir.session.commandes.relance.titre', { count: sansCommande.length })}
              </div>
              <div className={styles.relanceSous}>
                {t('comptoir.session.commandes.relance.sous')}
              </div>
            </div>
            <button
              type="button"
              className={styles.relancerTous}
              onClick={() => void relancer(sansCommande)}
            >
              {t('comptoir.session.commandes.relance.relancerTous', { count: sansCommande.length })}
            </button>
          </div>
          {sansCommande.map((client) => {
            const heure = relances[client.id];
            return (
              <div className={styles.ligne} key={client.id}>
                <div className={styles.ligneClient}>
                  <span className={styles.ligneNom}>{client.nom}</span>
                  <span className={styles.ligneMeta}>{`${client.lieu} · ${client.telephone}`}</span>
                </div>
                <span className={styles.habituel}>
                  {t('comptoir.session.commandes.relance.habituel', {
                    commande: texteHabituel(habituelles[client.id]),
                  })}
                </span>
                {heure && (
                  <span className={styles.relanceFaite}>
                    {t('comptoir.session.commandes.relance.relanceA', { heure })}
                  </span>
                )}
                <div className={styles.ligneActions}>
                  <button
                    type="button"
                    className={styles.bouton}
                    aria-label={`${t(heure ? 'comptoir.session.commandes.relance.relancerEncore' : 'comptoir.session.commandes.relance.relancer')} ${client.nom}`}
                    onClick={() => void relancer([client])}
                  >
                    {t(
                      heure
                        ? 'comptoir.session.commandes.relance.relancerEncore'
                        : 'comptoir.session.commandes.relance.relancer',
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.bouton}
                    aria-label={t('comptoir.session.commandes.relance.reprendreClient', {
                      nom: client.nom,
                    })}
                    onClick={() => void reprendre(client.nom, client.id)}
                  >
                    {t('comptoir.session.commandes.relance.reprendre')}
                  </button>
                </div>
              </div>
            );
          })}
          <div className={styles.message}>
            {t('comptoir.session.commandes.relance.message', {
              nom: premier.nom,
              session: nomSession,
              commande: texteHabituel(habituelles[premier.id]),
            })}
          </div>
        </section>
      )}
      <section className={styles.carte}>
        <div className={styles.entete}>
          <div>
            <div className={styles.titre} id="titre-commandes">
              {t('comptoir.session.commandes.titre')}
            </div>
            <div className={styles.sousTitre}>{t('comptoir.session.commandes.sousTitre')}</div>
          </div>
          <div className={styles.entetActions}>
            {peutSaisir && (
              <button
                type="button"
                className={styles.voirPlan}
                onClick={() => void reprendreVeille()}
              >
                {t('comptoir.session.commandes.reprendreVeille')}
              </button>
            )}
            {peutVoirLePlan && (
              <button type="button" className={styles.voirPlan} onClick={onVoirLePlan}>
                {t('comptoir.session.commandes.voirPlan')}
              </button>
            )}
          </div>
        </div>
        <div className={styles.defilement}>
          <div
            className={styles.tableau}
            style={{ '--produits': PRODUITS.length } as CSSProperties}
            ref={tableau}

            aria-labelledby="titre-commandes"
          >
            <div className={`${styles.grille} ${styles.grilleTitres}`}>
              <span>{t('comptoir.session.commandes.client')}</span>
              {PRODUITS.map((produit) => (
                <span className={styles.droite} key={produit.cle}>
                  {produit.libelle}
                </span>
              ))}
              <span className={styles.droite}>{t('comptoir.session.commandes.montantEstime')}</span>
            </div>
            {clients.map((client) => (
              <div className={`${styles.grille} ${styles.grilleLigne}`} key={client.id}>
                <span className={styles.client}>
                  {client.nom}
                  {peutSaisir && instantane.idsCommandes?.[client.id] && (
                    <button
                      type="button"
                      className={styles.annulerCommande}
                      aria-label={t('comptoir.session.commandes.annulerCommande', {
                        nom: client.nom,
                      })}
                      onClick={() => void annuler(client.nom, client.id)}
                    >
                      <span aria-hidden>×</span>
                    </button>
                  )}
                </span>
                {PRODUITS.map((produit) => (
                  <input
                    key={produit.cle}
                    className={styles.champ}
                    value={commandes[client.id]?.[produit.cle] ?? ''}
                    onChange={(e) =>
                      actions.saisirCommande(client.id, produit.cle, chiffres(e.target.value))
                    }
                    onKeyDown={entreePasseAuSuivant}
                    disabled={!peutSaisir}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={t('comptoir.session.commandes.quantite', {
                      produit: produit.libelle,
                      client: client.nom,
                    })}
                  />
                ))}
                <span className={styles.montant}>
                  {formaterNombre(montantEstime(client, commandes[client.id]))}
                </span>
              </div>
            ))}
            <div className={`${styles.grille} ${styles.totaux}`}>
              <span>{t('comptoir.session.commandes.totalPains')}</span>
              {PRODUITS.map((produit) => (
                <span className={styles.droite} key={produit.cle}>
                  {formaterNombre(plan[produit.cle]?.pains ?? 0)}
                </span>
              ))}
              <span className={styles.droite}>{formaterNombre(total)}</span>
            </div>
            <div className={`${styles.grille} ${styles.sacs}`}>
              <span>{t('comptoir.session.commandes.sacsAPetrir')}</span>
              {PRODUITS.map((produit) => (
                <span className={styles.sacsNombre} key={produit.cle}>
                  {String(plan[produit.cle]?.sacs ?? 0)}
                </span>
              ))}
              <span></span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
