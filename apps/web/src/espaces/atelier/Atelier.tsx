import { useTranslation } from '@/i18n';

import { EcransPrevus } from '../EcransPrevus.tsx';

const ECRANS = [
  { libelle: 'Produits et fiches techniques', recit: 'US-080' },
  { libelle: 'Plan du jour', recit: 'US-081' },
  { libelle: 'Validation du plan', recit: 'US-082' },
  { libelle: 'Production : ouverture, réalisé, clôture', recit: 'US-083' },
  { libelle: 'Consommation réelle et écarts', recit: 'US-084' },
  { libelle: 'Inventaire tournant', recit: 'US-093' },
] as const;

/** Espace atelier : plan, production, consommation, inventaire (parcours P5, P8). */
export default function Atelier() {
  const { t } = useTranslation();
  return (
    <EcransPrevus
      titre={t('accueil.planDuJour')}
      description="Plan du jour, production, consommation et inventaire tournant. Gros boutons, saisie tactile."
      ecrans={ECRANS}
    />
  );
}
