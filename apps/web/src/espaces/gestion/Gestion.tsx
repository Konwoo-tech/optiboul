import { useUtilisateurCourant } from '@optiboul/auth';
import { useTranslation } from '@optiboul/i18n';

import { EcransPrevus } from '../EcransPrevus.tsx';

const ECRANS = [
  { libelle: 'Semaines et planning', recit: 'US-030' },
  { libelle: 'Clients et dettes', recit: 'US-061' },
  { libelle: 'Fournisseurs et réceptions', recit: 'US-100' },
  { libelle: 'Stocks', recit: 'US-090' },
  { libelle: 'Dépenses et budget', recit: 'US-110' },
  { libelle: 'Personnel et paie', recit: 'US-120' },
  { libelle: 'Demandes', recit: 'US-071' },
  { libelle: 'Tableau de bord', recit: 'US-131' },
  { libelle: 'Administration', recit: 'US-020' },
] as const;

/** Espace gestion : back-office du gérant, du propriétaire et de l'administrateur. */
export default function Gestion() {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  // Gérant : Ma semaine (liste de tâches) ; propriétaire et administrateur : tableau de bord (O10).
  const titre =
    utilisateur?.profil === 'gerant' ? t('accueil.maSemaine') : t('accueil.tableauDeBord');
  return (
    <EcransPrevus
      titre={titre}
      description="Back-office du gérant et du propriétaire."
      ecrans={ECRANS}
    />
  );
}
