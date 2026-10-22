import { useTranslation } from '@/i18n';
import {
  useHistoriqueClientSimule,
  type ClientSimule,
  type LigneHistoriqueClient,
} from '@/simulation';
import { useToast } from '@/ui';
import { formaterNombre } from '@/utils';
import { useEffect, useRef } from 'react';

import styles from './EcranClients.module.css';
import { formaterJourCourt, formaterJourLong } from './formats.ts';
import { NIVEAU_DU_STATUT, statutDeSolde } from './logique.ts';

type Props = {
  client: ClientSimule;
  plafond: number;
  /** Date limite de règlement, `AAAA-MM-JJ`. */
  echeance: string;
};

/** « 14 oct. · 21:41 » pour la session du jour, « 13 oct. · nuit » pour les sessions passées. */
function quand(ligne: LigneHistoriqueClient, langue: string, nuit: string): string {
  const jour = formaterJourCourt(ligne.date, langue);
  return `${jour} · ${ligne.moment === 'nuit' ? nuit : ligne.moment}`;
}

/**
 * Volet de droite : solde, échéance, tarifs, historique des livraisons, et les deux envois du
 * relevé (PDF, WhatsApp), simulés par un message. Le focus vient sur le nom quand on change de
 * client, pour qu'un lecteur d'écran annonce le détail.
 */
export function DetailClient({ client, plafond, echeance }: Props) {
  const { t, i18n } = useTranslation();
  const afficherToast = useToast();
  const { data: historique = [] } = useHistoriqueClientSimule(client.id);
  const titre = useRef<HTMLHeadingElement>(null);

  useEffect(() => titre.current?.focus({ preventScroll: true }), [client.id]);

  const niveau = NIVEAU_DU_STATUT[statutDeSolde(client.solde, plafond)];
  const couleur = `var(--ob-${niveau}-texte)`;
  const libelleStatut = t(
    `clients.statut${{ ok: 'AJour', surveiller: 'Dette', bloquant: 'Depasse' }[niveau]}`,
  );

  return (
    <section className={styles.detail} aria-label={t('clients.detail')}>
      <div>
        <h2 className={styles.detailNom} ref={titre} tabIndex={-1}>
          {client.nom}
        </h2>
        <div className={styles.detailSousTitre}>
          {`${client.type} · ${client.lieu} · ${client.telephone}`}
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
                {quand(ligne, i18n.language, t('clients.nuit'))}
              </div>
            </div>
            <div className={styles.historiqueMontants}>
              <div className={styles.historiqueDu}>{`−${formaterNombre(ligne.du)}`}</div>
              <div className={styles.historiqueRecu}>{`+${formaterNombre(ligne.recu)}`}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.pdf}
          onClick={() => afficherToast(t('clients.toastPdf', { nom: client.nom }))}
        >
          {t('clients.relevePdf')}
        </button>
        <button
          type="button"
          className={styles.whatsapp}
          onClick={() => afficherToast(t('clients.toastReleve', { nom: client.nom }))}
        >
          {t('clients.envoyerReleve')}
        </button>
      </div>
    </section>
  );
}
