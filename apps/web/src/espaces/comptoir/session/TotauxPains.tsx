import { mouvementsInternesTotauxRetrieve } from '@/api';
import { useTranslation } from '@/i18n';
import { useQuery } from '@tanstack/react-query';

import { codeServeur } from './catalogue.ts';
import { formaterNombre, PRODUITS } from './calculs.ts';
import styles from './Mouvements.module.css';

type Totaux = Record<string, Record<string, number>>;

const LIGNES = [
  ['livres', 'comptoir.session.mouvements.totaux.livres'],
  ['vente_guichet', 'comptoir.session.mouvements.types.vente-guichet'],
  ['retours', 'comptoir.session.mouvements.types.retours'],
  ['reste_en_salle', 'comptoir.session.mouvements.types.reste-en-salle'],
  ['ration', 'comptoir.session.mouvements.types.ration'],
] as const;

/**
 * Pains de la session, par produit : livrés, vendus au guichet, retours, restes en salle, rations
 * (`GET /mouvements-internes/totaux/`). Relu quand les mouvements ou les livraisons changent.
 */
export function TotauxPains({ caisse, signature }: { caisse: string; signature: string }) {
  const { t } = useTranslation();
  const totaux = useQuery({
    queryKey: ['ecran', 'comptoir', 'totaux-pains', caisse, signature],
    queryFn: async () =>
      (await mouvementsInternesTotauxRetrieve({ caisse: Number(caisse) }))
        .data as unknown as Totaux,
  });
  if (!totaux.data) return null;

  return (
    <section className={styles.totaux} aria-labelledby="titre-totaux-pains">
      <div className={styles.listeTitre} id="titre-totaux-pains">
        {t('comptoir.session.mouvements.totaux.titre')}
      </div>
      <table className={styles.tableTotaux}>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.invisible}>
                {t('comptoir.session.mouvements.totaux.mouvement')}
              </span>
            </th>
            {PRODUITS.map((p) => (
              <th scope="col" key={p.cle}>
                {p.libelle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LIGNES.map(([cle, libelle]) => (
            <tr key={cle}>
              <th scope="row">{t(libelle)}</th>
              {PRODUITS.map((p) => (
                <td key={p.cle}>{formaterNombre(totaux.data?.[cle]?.[codeServeur(p.cle)] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
