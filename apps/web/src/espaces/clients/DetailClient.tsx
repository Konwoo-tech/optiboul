import { useTranslation } from '@/i18n';
import { useToast } from '@/ui';
import { formaterNombre } from '@/utils';
import { useEffect, useRef } from 'react';

import styles from './EcranClients.module.css';
import { ouvrirRelevePdf, useEnvoyerReleve, useHistoriqueClient } from './api.ts';
import { formaterJourCourt, formaterJourLong } from './formats.ts';
import { LIBELLE_DU_STATUT, NIVEAU_DU_STATUT, plafondDe, statutDeSolde } from './logique.ts';
import type { ClientDeLecran, LigneHistoriqueClient } from './types.ts';

type Props = {
  client: ClientDeLecran;
  plafond: number;
  /** Date limite de règlement, `AAAA-MM-JJ`. */
  echeance: string;
  /** Le focus vient sur le nom seulement après une action de la personne, pas à l'arrivée. */
  prendreFocus: boolean;
  onFermer: () => void;
  /** Gérant et propriétaire modifient la fiche ; absent : lecture seule. */
  onModifier?: () => void;
};

/** « 14 oct. · 21:41 » pour la session du jour, « 13 oct. · nuit » ou « · jour » pour les sessions passées. */
function quand(
  ligne: LigneHistoriqueClient,
  langue: string,
  creneaux: { nuit: string; jour: string },
): string {
  const jour = formaterJourCourt(ligne.date, langue);
  const moment =
    ligne.moment === 'nuit'
      ? creneaux.nuit
      : ligne.moment === 'jour'
        ? creneaux.jour
        : ligne.moment;
  return `${jour} · ${moment}`;
}

/**
 * Volet de droite : solde, échéance, tarifs, historique des livraisons, et les deux envois du
 * relevé (PDF, WhatsApp). Le focus vient sur le nom quand on change de
 * client, pour qu'un lecteur d'écran annonce le détail.
 */
export function DetailClient({
  client,
  plafond,
  echeance,
  prendreFocus,
  onFermer,
  onModifier,
}: Props) {
  const { t, i18n } = useTranslation();
  const afficherToast = useToast();
  const envoyerReleve = useEnvoyerReleve();
  const { data: historique = [] } = useHistoriqueClient(client.id);
  const titre = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (prendreFocus) titre.current?.focus({ preventScroll: true });
  }, [client.id, prendreFocus]);

  const statut = statutDeSolde(client.solde, plafondDe(client, plafond));
  const niveau = NIVEAU_DU_STATUT[statut];
  const couleur = `var(--ob-${niveau}-texte)`;
  const libelleStatut = t(LIBELLE_DU_STATUT[statut]);

  return (
    // Échap ferme le détail (le clavier n'a pas d'autre moyen que de rechoisir le client).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className={styles.detail}
      aria-label={t('clients.detail')}
      onKeyDown={(evenement) => evenement.key === 'Escape' && onFermer()}
    >
      <div>
        <h2 className={styles.detailNom} ref={titre} tabIndex={-1}>
          {client.nom}
        </h2>
        <div className={styles.detailSousTitre}>
          {`${t(`clients.types.${client.type}`)} · ${client.lieu} · ${client.telephone}`}
        </div>
      </div>
      <div className={styles.detailSolde}>
        <div className={styles.detailMontant} style={{ color: couleur }}>
          {`${formaterNombre(client.solde)} FCFA`}
        </div>
        <span
          className={styles.statut}
          style={{ background: `var(--ob-${niveau}-fond)`, color: couleur }}
        >
          {libelleStatut}
        </span>
      </div>
      <div className={styles.echeance}>
        {client.solde < 0
          ? t('clients.echeance', { date: formaterJourLong(echeance, i18n.language) })
          : t('clients.rienARegler')}
      </div>
      <div className={styles.tarifs}>{t('clients.tarifs', client.tarifs)}</div>
      <h3 className={styles.historiqueTitre}>{t('clients.historique')}</h3>
      <ul className={styles.historique}>
        {historique.map((ligne) => (
          <li key={ligne.bon} className={styles.historiqueLigne}>
            <div className={styles.historiqueTexte}>
              <div className={styles.historiqueLibelle}>
                {t('clients.livraison', { bon: ligne.bon })}
              </div>
              <div className={styles.historiqueDate}>
                {quand(ligne, i18n.language, { nuit: t('clients.nuit'), jour: t('clients.jour') })}
              </div>
            </div>
            <div className={styles.historiqueMontants}>
              <div className={styles.historiqueDu}>
                <span className={styles.cache}>{t('clients.du')}</span>
                {`−${formaterNombre(ligne.du)}`}
              </div>
              <div className={styles.historiqueRecu}>
                <span className={styles.cache}>{t('clients.paye')}</span>
                {`+${formaterNombre(ligne.recu)}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        {onModifier && (
          <button type="button" className={styles.pdf} onClick={onModifier}>
            {t('clients.nouveau.modifier')}
          </button>
        )}
        <button
          type="button"
          className={styles.pdf}
          onClick={() => {
            ouvrirRelevePdf(client.id);
            afficherToast(t('clients.toastPdf', { nom: client.nom }));
          }}
        >
          {t('clients.relevePdf')}
        </button>
        <button
          type="button"
          className={styles.whatsapp}
          disabled={envoyerReleve.isPending}
          onClick={() =>
            envoyerReleve.mutate(client.id, {
              onSuccess: () => afficherToast(t('clients.toastReleve', { nom: client.nom })),
              onError: () => afficherToast(t('clients.toastReleveErreur', { nom: client.nom })),
            })
          }
        >
          {t('clients.envoyerReleve')}
        </button>
      </div>
    </section>
  );
}
