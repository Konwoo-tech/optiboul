import { Badge, Card, Container, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from '@optiboul/i18n';
import { BandeauHorsLigne, EnTeteApplication } from '@optiboul/ui';
import { Route, Routes } from 'react-router';

import { ECRANS } from './ecrans.ts';

function Accueil() {
  const { t } = useTranslation();
  return (
    <Container size="lg" py="lg">
      <Stack gap="md">
        <Title order={2}>{t('accueil.maCaisse')}</Title>
        <Text c="dimmed">
          Caisse, commandes, livraisons et encaissements. Navigation entièrement au clavier.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {ECRANS.map((ecran) => (
            <Card key={ecran.recit} withBorder padding="lg">
              <Text fw={600}>{ecran.libelle}</Text>
              <Badge mt="sm" variant="light" color="chocolat">
                {ecran.recit} · {t('commun.bientot')}
              </Badge>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}

export function App() {
  const { t } = useTranslation();
  return (
    <>
      <EnTeteApplication titre={t('applications.comptoir')} />
      <BandeauHorsLigne />
      <Routes>
        <Route index element={<Accueil />} />
      </Routes>
    </>
  );
}
