import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { Text } from '@mantine/core';
import { Carte, EcranChargement, EcranErreur } from '@/ui';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { codeErreur, useTableauDeBord } from './api.ts';
import { Alertes } from './Alertes.tsx';
import { Indicateurs } from './Indicateurs.tsx';
import { ProductionParProduit } from './ProductionParProduit.tsx';
import { RecetteParNuit } from './RecetteParNuit.tsx';
import { peutVoirTableauDeBord } from './regles.ts';
import styles from './TableauDeBord.module.css';

/**
 * Gestion › Tableau de bord (US-130 à US-132) : recette du mois et taux d'encaissement, dettes
 * clients et fournisseurs, semaine en cours, recette par nuit, production par produit et alertes
 * cliquables jusqu'au détail. Lecture seule : le gérant et le propriétaire le voient (cahier des
 * charges §3.3) ; ni la marge (US-134) ni l'export (US-133) ne figurent dans la maquette.
 */
export default function EcranTableauDeBord({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const { utilisateur, chargement, injoignable, reessayer } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useTableauDeBord(nom);

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    // Sans personne connectée (la session a pris fin), rien ne se charge : le message le dit.
    const interdit =
      (!chargement && !injoignable && !utilisateur) ||
      (Boolean(profil) &&
        (!peutVoirTableauDeBord(profil) || codeErreur(requete.error) === 'droit_insuffisant'));
    let contenu;
    if (interdit) {
      contenu = (
        <Carte role="alert">
          <Text>{t('gestion.tableauDeBord.interdit')}</Text>
        </Carte>
      );
    } else if (requete.isError || injoignable) {
      contenu = (
        <EcranErreur
          titre={t('erreur.titre')}
          message={t('gestion.tableauDeBord.erreurChargement')}
          libelleAction={t('erreur.reessayer')}
          onAction={() => (injoignable ? reessayer() : void requete.refetch())}
        />
      );
    } else {
      contenu = <EcranChargement />;
    }
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {contenu}
      </>
    );
  }

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <Indicateurs instantane={instantane} />
        <div className={styles.rangee}>
          <RecetteParNuit instantane={instantane} />
          <Alertes alertes={instantane.alertes} />
        </div>
        <ProductionParProduit instantane={instantane} />
      </div>
    </>
  );
}
