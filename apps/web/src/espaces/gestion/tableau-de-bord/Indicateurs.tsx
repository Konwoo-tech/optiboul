import { useTranslation } from '@/i18n';
import { formaterDateCourte, formaterNombre } from '@/utils';

import { formaterTaux, nomDuMois } from './affichage.ts';
import { tauxEncaissement } from './regles.ts';
import styles from './TableauDeBord.module.css';
import type { InstantaneTableauDeBord } from './types.ts';

type Indicateur = {
  cle: string;
  libelle: string;
  valeur: string;
  unite: string;
  detail: string;
  /** Rouge : il y a quelque chose à traiter. */
  alerte: boolean;
};

/**
 * Les quatre chiffres du haut : recette du mois et taux d'encaissement, dettes clients, dettes
 * fournisseurs, semaine en cours avec son gérant et son responsable de production.
 */
export function Indicateurs({ instantane }: { instantane: InstantaneTableauDeBord }) {
  const { t, i18n } = useTranslation();
  const { recette, dettesClients, dettesFournisseurs, semaine } = instantane;
  const jour = (iso: string) => formaterDateCourte(new Date(iso), i18n.language);

  const { marge } = instantane;

  const indicateurs: Indicateur[] = [
    {
      cle: 'recette',
      libelle: t('gestion.tableauDeBord.recette', {
        mois: nomDuMois(instantane.mois, i18n.language),
      }),
      valeur: formaterNombre(recette.encaissee),
      unite: 'FCFA',
      detail: t('gestion.tableauDeBord.tauxEncaissement', {
        taux: formaterTaux(tauxEncaissement(recette.encaissee, recette.due), i18n.language),
      }),
      alerte: false,
    },
    {
      cle: 'dettes-clients',
      libelle: t('gestion.tableauDeBord.dettesClients'),
      // Comme la maquette : une dette est un solde négatif.
      valeur: formaterNombre(-dettesClients.montant),
      unite: 'FCFA',
      detail: t('gestion.tableauDeBord.dettesClientsDetail', {
        clients: dettesClients.clients,
        plafond: dettesClients.auDessusDuPlafond,
      }),
      alerte: dettesClients.auDessusDuPlafond > 0,
    },
    {
      cle: 'dettes-fournisseurs',
      libelle: t('gestion.tableauDeBord.dettesFournisseurs'),
      valeur: formaterNombre(dettesFournisseurs.montant),
      unite: 'FCFA',
      detail: t('gestion.tableauDeBord.dettesFournisseursDetail', {
        count: dettesFournisseurs.facturesEnRetard,
      }),
      alerte: dettesFournisseurs.facturesEnRetard > 0,
    },
    // La marge n'existe que sur le vrai serveur (le prototype ne la montre pas).
    ...(marge
      ? [
          {
            cle: 'marge',
            libelle: t('gestion.tableauDeBord.marge'),
            valeur: formaterNombre(marge.marge),
            unite: 'FCFA',
            detail: t('gestion.tableauDeBord.margeDetail', {
              matieres: formaterNombre(marge.matieres),
              charges: formaterNombre(marge.charges),
            }),
            alerte: marge.marge < 0,
          },
        ]
      : []),
    {
      cle: 'semaine',
      libelle: t('coque.semaine', {
        numero: semaine.numero,
        du: jour(semaine.du),
        au: jour(semaine.au),
      }),
      valeur: semaine.gerant,
      unite: '',
      detail: t('gestion.tableauDeBord.production', { nom: semaine.production }),
      alerte: false,
    },
  ];

  return (
    <ul className={styles.indicateurs} aria-label={t('gestion.tableauDeBord.indicateurs')}>
      {indicateurs.map((indicateur) => (
        <li className={styles.indicateur} key={indicateur.cle}>
          <div className={styles.indicateurLibelle}>{indicateur.libelle}</div>
          <div
            className={
              indicateur.alerte
                ? `${styles.indicateurValeur} ${styles.indicateurAlerte}`
                : styles.indicateurValeur
            }
          >
            {indicateur.valeur} <span className={styles.unite}>{indicateur.unite}</span>
          </div>
          <div className={styles.indicateurDetail}>{indicateur.detail}</div>
        </li>
      ))}
    </ul>
  );
}
