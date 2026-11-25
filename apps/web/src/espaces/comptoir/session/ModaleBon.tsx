import { useTranslation } from '@/i18n';
import { FenetreModale, useToast } from '@/ui';

import { envoyerBonParWhatsapp, ouvrirBonPdf } from './api.ts';

import { dateCourte, dateSansAnnee, libelleDuMode, nomDeSession } from './affichage.ts';
import { formaterNombre, formaterSigne, PRODUITS } from './calculs.ts';
import styles from './Fenetres.module.css';
import type { Livraison, SessionCaisse } from './types.ts';

type Props = {
  livraison: Livraison;
  session: SessionCaisse;
  echeanceDettes: string;
  onFermer: () => void;
};

/** Bon de livraison : aperçu du ticket, envoi par WhatsApp ou PDF. */
export function ModaleBon({ livraison, session, echeanceDettes, onFermer }: Props) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const mode =
    livraison.mode === 'especes'
      ? t('comptoir.session.modales.bon.especes')
      : libelleDuMode(t, livraison.mode);

  const lignes = PRODUITS.filter((p) => livraison.quantites[p.cle] > 0).map((p) => ({
    cle: p.cle,
    produit: p.libelle,
    quantite: livraison.quantites[p.cle],
    prix: formaterNombre(livraison.prix[p.cle]),
    total: formaterNombre(livraison.quantites[p.cle] * livraison.prix[p.cle]),
  }));
  const totaux = [
    [t('comptoir.session.modales.bon.du'), formaterNombre(livraison.du)],
    [t('comptoir.session.modales.bon.paye', { mode }), formaterNombre(livraison.recu)],
    [t('comptoir.session.modales.bon.reste'), formaterSigne(livraison.reste)],
    [t('comptoir.session.modales.bon.nouveauSolde'), formaterNombre(livraison.soldeApres)],
  ] as const;

  const servi =
    t('comptoir.session.modales.bon.servi', { nom: livraison.par }) +
    (livraison.reference
      ? t('comptoir.session.modales.bon.reference', { reference: livraison.reference })
      : '') +
    (livraison.autorisePar
      ? t('comptoir.session.modales.bon.autorisePar', { nom: livraison.autorisePar })
      : '');

  return (
    <FenetreModale
      titre={t('comptoir.session.modales.bon.titre')}
      largeurMax={420}
      onFermer={onFermer}
    >
      <div className={styles.bon}>
        <div className={styles.bonEnseigne}>
          <div className={styles.bonNom}>Boulangerie du Faubourg</div>
          <div className={styles.bonAdresse}>Etoudi, Yaoundé · OptiBoul ERP</div>
        </div>
        <div className={styles.bonReferences}>
          <span>{t('comptoir.session.modales.bon.numero', { numero: livraison.numero })}</span>
          <span>
            {t('comptoir.session.modales.bon.quand', {
              date: dateCourte(session.date, i18n.language),
              heure: livraison.heure,
              session: nomDeSession(t, session.type),
            })}
          </span>
        </div>
        <div className={styles.bonClient}>{livraison.nom}</div>
        {lignes.map((ligne) => (
          <div className={styles.bonLigne} key={ligne.cle}>
            {/* Un nœud de texte par valeur, comme la maquette : le crénage change à la jonction. */}
            <span>
              {ligne.produit} · {ligne.quantite} × {ligne.prix}
            </span>
            <span className={styles.bonLigneTotal}>{ligne.total}</span>
          </div>
        ))}
        <div className={styles.bonTotaux}>
          {totaux.map(([libelle, valeur]) => (
            <div className={styles.bonLigne} key={libelle}>
              <span>{libelle}</span>
              <span className={styles.bonTotal}>{`${valeur} FCFA`}</span>
            </div>
          ))}
        </div>
        {livraison.soldeApres < 0 && (
          <div className={styles.bonDette}>
            {t('comptoir.session.modales.bon.dette', {
              date: dateSansAnnee(echeanceDettes, i18n.language),
            })}
          </div>
        )}
        <div className={styles.bonServi}>{servi}</div>
      </div>
      <div className={styles.boutons}>
        <button type="button" className={styles.discret} onClick={onFermer}>
          {t('comptoir.session.modales.fermer')}
        </button>
        <button
          type="button"
          className={styles.annuler}
          onClick={() =>
            void envoyerBonParWhatsapp(livraison.id).then(
              () =>
                afficher(t('comptoir.session.modales.bon.toastWhatsapp', { nom: livraison.nom })),
              () => afficher(t('comptoir.session.modales.bon.toastWhatsappErreur')),
            )
          }
        >
          {t('comptoir.session.modales.bon.whatsapp')}
        </button>
        <button
          type="button"
          className={styles.confirmer}
          onClick={() => {
            ouvrirBonPdf(livraison.id);
            afficher(t('comptoir.session.modales.bon.toastPdf', { numero: livraison.numero }));
          }}
        >
          {t('comptoir.session.modales.bon.pdf')}
        </button>
      </div>
    </FenetreModale>
  );
}
