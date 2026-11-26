import { livraisonsPropositionRetrieve, type Proposition } from '@/api';
import { useTranslation } from '@/i18n';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { formaterNombre } from './calculs.ts';
import styles from './Livraisons.module.css';

type Props = {
  clientId: string;
  /** Ce que le client a commandé, déjà mis en texte : « 20 BAG · 5 KO ». */
  commande: string;
  occupe: boolean;
  /** Produits commandés dont le client n'a pas de prix : la livraison est impossible. */
  sansPrix?: readonly string[];
  onLivrer: () => void;
};

/**
 * Le client a commandé : le serveur propose la livraison (prix du client, montant dû, solde
 * après), et un seul geste la fait (`livrer-comme-commande`).
 */
export function CommeCommande({ clientId, commande, occupe, sansPrix = [], onLivrer }: Props) {
  const { t } = useTranslation();
  const idNote = useId();
  const bloque = sansPrix.length > 0;
  const proposition = useQuery({
    queryKey: ['ecran', 'comptoir', 'proposition', clientId, commande],
    queryFn: async () =>
      (await livraisonsPropositionRetrieve({ client: Number(clientId) })).data as Proposition,
  });
  const p = proposition.data;

  return (
    <div className={styles.commeCommande}>
      <div className={styles.commeCommandeTexte}>
        <div className={styles.commeCommandeTitre}>
          {t('comptoir.session.livraisons.commande', { commande })}
        </div>
        {bloque ? (
          <div className={styles.commeCommandeSous} id={idNote} role="note">
            {t('comptoir.session.livraisons.prixManquant', { produits: sansPrix.join(', ') })}
          </div>
        ) : (
          p && (
            <div className={styles.commeCommandeSous}>
              {t('comptoir.session.livraisons.commandePropose', {
                montant: formaterNombre(p.montant_du),
                solde: formaterNombre(p.solde_apres),
              })}
            </div>
          )
        )}
      </div>
      <button
        type="button"
        className={styles.commeCommandeBouton}
        disabled={occupe || bloque}
        aria-describedby={bloque ? idNote : undefined}
        onClick={onLivrer}
      >
        {t('comptoir.session.livraisons.commeCommande')}
      </button>
    </div>
  );
}
