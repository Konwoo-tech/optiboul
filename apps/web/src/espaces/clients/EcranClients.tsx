import { useUtilisateurCourant } from '@/auth';
import { ErreurApi } from '@/api';
import { useTranslation } from '@/i18n';
import { useToast, Paginee } from '@/ui';
import { formaterNombre } from '@/utils';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../navigation.ts';
import { EnTeteEcran } from '../EnTeteEcran.tsx';
import { useClients, useCreerClient, useModifierClient, useRelancerClients } from './api.ts';
import { ModaleClient } from './ModaleClient.tsx';
import type { ClientDeLecran, ListeClients } from './types.ts';
import { DetailClient } from './DetailClient.tsx';
import styles from './EcranClients.module.css';
import {
  auDelaDuPlafond,
  compteursDeFiltres,
  enDette,
  FILTRES,
  filtrerClients,
  LIBELLE_DU_STATUT,
  NIVEAU_DU_STATUT,
  peutRelancer,
  plafondDe,
  remplissageJauge,
  statutDeSolde,
  totalDesDettes,
  type FiltreClients,
} from './logique.ts';

const CLE_FILTRE: Record<FiltreClients, string> = {
  tous: 'clients.filtreTous',
  dette: 'clients.filtreDette',
  depasse: 'clients.filtreDepasse',
};

type LigneProps = {
  client: ClientDeLecran;
  plafond: number;
  choisi: boolean;
  relancable: boolean;
  onChoisir: () => void;
  onRelancer: () => void;
};

function LigneClient({ client, plafond, choisi, relancable, onChoisir, onRelancer }: LigneProps) {
  const { t } = useTranslation();
  const plafondDuClient = plafondDe(client, plafond);
  const statut = statutDeSolde(client.solde, plafondDuClient);
  const niveau = NIVEAU_DU_STATUT[statut];
  const couleur = `var(--ob-${niveau}-texte)`;
  const libelleRelance = client.relance ? t('clients.relance') : t('clients.relancer');
  const nomRelance = t(client.relance ? 'clients.relanceNom' : 'clients.relancerNom', {
    nom: client.nom,
  });

  return (
    // La ligne entière se clique à la souris ; au clavier, on passe par le nom (bouton).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <li
      className={`${styles.ligne} ${choisi ? styles.ligneChoisie : ''}`}
      data-client={client.id}
      onClick={onChoisir}
    >
      <div className={styles.identite}>
        <button type="button" className={styles.nom} aria-pressed={choisi}>
          {client.nom}
        </button>
        <div
          className={styles.sousTitre}
        >{`${t(`clients.types.${client.type}`)} · ${client.lieu}`}</div>
      </div>
      <div className={styles.jaugeColonne}>
        <div className={styles.jauge} aria-hidden>
          <div
            className={styles.jaugeRemplie}
            style={{
              width: `${remplissageJauge(client.solde, plafondDuClient)}%`,
              background: couleur,
            }}
          />
        </div>
        <div className={styles.jaugeTexte}>
          {client.solde < 0
            ? t('clients.jaugeTexte', {
                dette: formaterNombre(-client.solde),
                plafond: formaterNombre(plafondDuClient),
              })
            : t('clients.aucuneDette')}
        </div>
      </div>
      <div className={styles.solde} style={{ color: couleur }}>
        {client.solde < 0 ? formaterNombre(client.solde) : '0'}
      </div>
      <span
        className={styles.statut}
        style={{ background: `var(--ob-${niveau}-fond)`, color: couleur }}
      >
        {t(LIBELLE_DU_STATUT[statut])}
      </span>
      {relancable && client.solde < 0 && (
        <button
          type="button"
          className={styles.relancer}
          aria-label={nomRelance}
          onClick={(evenement) => {
            evenement.stopPropagation();
            onRelancer();
          }}
        >
          {libelleRelance}
        </button>
      )}
    </li>
  );
}

function Chiffres({ donnees }: { donnees: ListeClients }) {
  const { t } = useTranslation();
  const { clients, plafond } = donnees;
  const lignes = [
    {
      libelle: t('clients.statDettes'),
      valeur: `${formaterNombre(totalDesDettes(clients))} FCFA`,
      couleur: 'var(--ob-surveiller-texte)',
    },
    {
      libelle: t('clients.statEnDette'),
      valeur: String(enDette(clients).length),
      couleur: 'var(--ob-encre)',
    },
    {
      libelle: t('clients.statAuDela', { plafond: formaterNombre(plafond) }),
      valeur: String(auDelaDuPlafond(clients, plafond).length),
      couleur: 'var(--ob-bloquant-texte)',
    },
  ];
  return (
    <div className={styles.chiffres}>
      {lignes.map((ligne) => (
        <div key={ligne.libelle} className={styles.chiffre}>
          <div className={styles.chiffreLibelle}>{ligne.libelle}</div>
          <div className={styles.chiffreValeur} style={{ color: ligne.couleur }}>
            {ligne.valeur}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Le message d'une création ou d'une modification refusée : le champ en cause, sinon un message général. */
function refusDeSaisie(erreur: unknown): string {
  if (erreur instanceof ErreurApi && erreur.status === 400) {
    const champs = Object.keys((erreur.details ?? {}) as object);
    if (champs.includes('telephone')) return 'telephone';
    if (champs.includes('nom')) return 'nom';
  }
  return 'defaut';
}

/**
 * Clients et dettes (US-060 à US-064), le même écran dans le comptoir (caissière) et dans la
 * gestion (gérant, propriétaire). Seuls le gérant et le propriétaire relancent. Le filtre et le
 * client ouvert vivent dans l'adresse (`?filtre=dette&client=alain`) : le tableau de bord et la
 * session peuvent y renvoyer.
 */
export default function EcranClients({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const afficherToast = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const { data, isPending, isError } = useClients();
  const relancer = useRelancerClients();
  const creer = useCreerClient();
  const modifierClient = useModifierClient();
  const [nouveau, setNouveau] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [parametres, definirParametres] = useSearchParams();
  const [focusDetail, setFocusDetail] = useState(false);

  const relancable = peutRelancer(utilisateur?.profil);
  const filtreDemande = parametres.get('filtre');
  const filtre = FILTRES.find((f) => f === filtreDemande) ?? 'tous';
  const choisi = data?.clients.find((c) => c.id === parametres.get('client'));

  const modifier = (changements: Record<string, string | null>) =>
    definirParametres(
      (actuels) => {
        const suivants = new URLSearchParams(actuels);
        for (const [cle, valeur] of Object.entries(changements)) {
          if (valeur === null || valeur === 'tous') suivants.delete(cle);
          else suivants.set(cle, valeur);
        }
        return suivants;
      },
      { replace: true },
    );

  const clientEdite = data?.clients.find((c) => c.id === edition);
  let contenu;
  if (isError) {
    contenu = (
      <div className={styles.message} role="alert">
        {t('clients.erreur')}
      </div>
    );
  } else if (isPending || !data) {
    contenu = <output className={styles.message}>{t('clients.chargement')}</output>;
  } else {
    const { clients, plafond, echeance } = data;
    const compteurs = compteursDeFiltres(clients, plafond);
    const liste = filtrerClients(clients, filtre, plafond);
    const dettes = enDette(clients);

    // Le message suit le résultat : « envoyée » seulement si le serveur l'a confirmé.
    const surErreur = () => afficherToast(t('clients.toastRelanceErreur'));
    const relancerUn = (client: ClientDeLecran) =>
      relancer.mutate([client.id], {
        onSuccess: ({ relances }) =>
          relances === 0
            ? surErreur()
            : afficherToast(
                t('clients.toastRelance', {
                  nom: client.nom,
                  montant: formaterNombre(-client.solde),
                }),
              ),
        onError: surErreur,
      });
    const relancerTous = () =>
      relancer.mutate(
        dettes.map((c) => c.id),
        {
          onSuccess: ({ relances }) =>
            relances === 0
              ? surErreur()
              : afficherToast(t('clients.toastRelanceGroupee', { count: relances })),
          onError: surErreur,
        },
      );
    const choisir = (client: ClientDeLecran) => {
      // Rechoisir le client ouvert referme le détail.
      setFocusDetail(true);
      modifier({ client: choisi?.id === client.id ? null : client.id });
    };
    const fermer = () => {
      const id = choisi?.id;
      modifier({ client: null });
      document.querySelector<HTMLElement>(`[data-client="${id}"] button`)?.focus();
    };

    contenu = (
      <div className={styles.ecran}>
        <Chiffres donnees={data} />
        <div className={styles.barre}>
          <fieldset className={styles.filtres} aria-label={t('clients.filtres')}>
            {FILTRES.map((f) => (
              <button
                key={f}
                type="button"
                className={styles.filtre}
                aria-pressed={filtre === f}
                onClick={() => modifier({ filtre: f })}
              >
                {t('clients.filtreAvecNombre', { libelle: t(CLE_FILTRE[f]), n: compteurs[f] })}
              </button>
            ))}
          </fieldset>
          {relancable && (
            <div className={styles.actionsBarre}>
              {dettes.length > 0 && (
                <button type="button" className={styles.relancerTous} onClick={relancerTous}>
                  {t('clients.relancerTous', { count: dettes.length })}
                </button>
              )}
              <button
                type="button"
                className={styles.nouveauClient}
                onClick={() => setNouveau(true)}
              >
                <span aria-hidden>+ </span>
                {t('clients.nouveau.ajouter')}
              </button>
            </div>
          )}
        </div>
        <div className={styles.corps}>
          <Paginee elements={liste} cle={filtre}>
            {(visibles) => (
              <ul className={styles.liste} aria-label={t('clients.liste')}>
                {visibles.map((client) => (
                  <LigneClient
                    key={client.id}
                    client={client}
                    plafond={plafond}
                    choisi={choisi?.id === client.id}
                    relancable={relancable}
                    onChoisir={() => choisir(client)}
                    onRelancer={() => relancerUn(client)}
                  />
                ))}
                {liste.length === 0 && <li className={styles.vide}>{t('clients.vide')}</li>}
              </ul>
            )}
          </Paginee>
          {choisi ? (
            <DetailClient
              client={choisi}
              plafond={plafond}
              echeance={echeance}
              prendreFocus={focusDetail}
              onFermer={fermer}
              onModifier={relancable ? () => setEdition(choisi.id) : undefined}
            />
          ) : (
            <div className={styles.detail}>
              <div className={styles.detailVide}>{t('clients.detailVide')}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      {contenu}
      {nouveau && (
        <ModaleClient
          envoiEnCours={creer.isPending}
          onFermer={() => setNouveau(false)}
          onConfirmer={async (client) => {
            try {
              await creer.mutateAsync(client);
              setNouveau(false);
              afficherToast(t('clients.nouveau.toast', { nom: client.nom }));
              return null;
            } catch (erreur) {
              return refusDeSaisie(erreur);
            }
          }}
        />
      )}
      {clientEdite && (
        <ModaleClient
          client={clientEdite}
          envoiEnCours={modifierClient.isPending}
          onFermer={() => setEdition(null)}
          onConfirmer={async (corps) => {
            try {
              await modifierClient.mutateAsync({ id: clientEdite.id, corps });
              setEdition(null);
              afficherToast(t('clients.nouveau.toastModifie', { nom: corps.nom }));
              return null;
            } catch (erreur) {
              return refusDeSaisie(erreur);
            }
          }}
        />
      )}
    </>
  );
}
