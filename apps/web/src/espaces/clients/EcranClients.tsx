import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import {
  useClientsSimules,
  useRelancerClientsSimules,
  type ClientSimule,
  type ListeClientsSimulee,
} from '@/simulation';
import { useToast } from '@/ui';
import { formaterNombre } from '@/utils';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../navigation.ts';
import { EnTeteEcran } from '../EnTeteEcran.tsx';
import { DetailClient } from './DetailClient.tsx';
import styles from './EcranClients.module.css';
import {
  auDelaDuPlafond,
  compteursDeFiltres,
  enDette,
  FILTRES,
  filtrerClients,
  NIVEAU_DU_STATUT,
  peutRelancer,
  remplissageJauge,
  statutDeSolde,
  totalDesDettes,
  type FiltreClients,
} from './logique.ts';

const CLE_STATUT = { ok: 'AJour', surveiller: 'Dette', bloquant: 'Depasse' } as const;
const CLE_FILTRE: Record<FiltreClients, string> = {
  tous: 'clients.filtreTous',
  dette: 'clients.filtreDette',
  depasse: 'clients.filtreDepasse',
};

type LigneProps = {
  client: ClientSimule;
  plafond: number;
  choisi: boolean;
  relancable: boolean;
  onChoisir: () => void;
  onRelancer: () => void;
};

function LigneClient({ client, plafond, choisi, relancable, onChoisir, onRelancer }: LigneProps) {
  const { t } = useTranslation();
  const niveau = NIVEAU_DU_STATUT[statutDeSolde(client.solde, plafond)];
  const couleur = `var(--ob-${niveau}-texte)`;
  const libelleRelance = client.relance ? t('clients.relance') : t('clients.relancer');

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
        <div className={styles.sousTitre}>{`${client.type} · ${client.lieu}`}</div>
      </div>
      <div className={styles.jaugeColonne}>
        <div className={styles.jauge} aria-hidden>
          <div
            className={styles.jaugeRemplie}
            style={{ width: `${remplissageJauge(client.solde, plafond)}%`, background: couleur }}
          />
        </div>
        <div className={styles.jaugeTexte}>
          {client.solde < 0
            ? t('clients.jaugeTexte', {
                dette: formaterNombre(-client.solde),
                plafond: formaterNombre(plafond),
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
        {t(`clients.statut${CLE_STATUT[niveau]}`)}
      </span>
      {relancable && client.solde < 0 && (
        <button
          type="button"
          className={styles.relancer}
          aria-label={`${libelleRelance} ${client.nom}`}
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

function Chiffres({ donnees }: { donnees: ListeClientsSimulee }) {
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
  const { data, isPending, isError } = useClientsSimules();
  const relancer = useRelancerClientsSimules();
  const [parametres, definirParametres] = useSearchParams();

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

  let contenu;
  if (isError) {
    contenu = (
      <div className={styles.message} role="alert">
        {t('clients.erreur')}
      </div>
    );
  } else if (isPending) {
    contenu = <output className={styles.message}>{t('clients.chargement')}</output>;
  } else {
    const { clients, plafond, echeance } = data;
    const compteurs = compteursDeFiltres(clients, plafond);
    const liste = filtrerClients(clients, filtre, plafond);
    const dettes = enDette(clients);

    const relancerUn = (client: ClientSimule) => {
      relancer.mutate([client.id]);
      afficherToast(
        t('clients.toastRelance', { nom: client.nom, montant: formaterNombre(-client.solde) }),
      );
    };
    const relancerTous = () => {
      relancer.mutate(dettes.map((c) => c.id));
      afficherToast(t('clients.toastRelanceGroupee', { count: dettes.length }));
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
          {relancable && dettes.length > 0 && (
            <button type="button" className={styles.relancerTous} onClick={relancerTous}>
              {t('clients.relancerTous', { count: dettes.length })}
            </button>
          )}
        </div>
        <div className={styles.corps}>
          <ul className={styles.liste} aria-label={t('clients.liste')}>
            {liste.map((client) => (
              <LigneClient
                key={client.id}
                client={client}
                plafond={plafond}
                choisi={choisi?.id === client.id}
                relancable={relancable}
                onChoisir={() => modifier({ client: client.id })}
                onRelancer={() => relancerUn(client)}
              />
            ))}
            {liste.length === 0 && <li className={styles.vide}>{t('clients.vide')}</li>}
          </ul>
          {choisi ? (
            <DetailClient client={choisi} plafond={plafond} echeance={echeance} />
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
    </>
  );
}
