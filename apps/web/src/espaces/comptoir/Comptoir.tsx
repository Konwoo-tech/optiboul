import { Group, Kbd, Text } from '@mantine/core';
import { useTranslation } from '@/i18n';
import { RACCOURCIS_COMPTOIR } from '@/utils';

import { EcransPrevus } from '../EcransPrevus.tsx';

const ECRANS = [
  { libelle: 'Connexion nom + code à 4 chiffres', recit: 'US-010' },
  { libelle: 'Ouvrir la caisse', recit: 'US-040' },
  { libelle: 'Commandes et reprise de la veille', recit: 'US-050' },
  { libelle: 'Livrer comme commandé', recit: 'US-051' },
  { libelle: 'Encaisser', recit: 'US-052' },
  { libelle: 'Plafond dépassé', recit: 'US-053' },
  { libelle: 'Bon de livraison', recit: 'US-054' },
  { libelle: 'Remise au coffre', recit: 'US-041' },
  { libelle: 'Fermer la caisse', recit: 'US-042' },
] as const;

/** Espace comptoir : caisse, commandes, livraisons, encaissements (parcours P3, P4). */
export default function Comptoir() {
  const { t } = useTranslation();
  return (
    <EcransPrevus
      titre={t('accueil.maCaisse')}
      description="Caisse, commandes, livraisons et encaissements. Navigation entièrement au clavier."
      ecrans={ECRANS}
    >
      <Group gap="md">
        {Object.entries(RACCOURCIS_COMPTOIR).map(([touche, action]) => (
          <Text key={touche} size="sm">
            <Kbd>{touche}</Kbd> {action}
          </Text>
        ))}
      </Group>
    </EcransPrevus>
  );
}
