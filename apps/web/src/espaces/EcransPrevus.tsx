import { Badge, Card, Container, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from '@/i18n';
import type { ReactNode } from 'react';

export type EcranPrevu = { libelle: string; recit: string };

/** Page d'attente d'un espace : les écrans prévus, reliés aux récits du backlog. */
export function EcransPrevus({
  titre,
  description,
  ecrans,
  children,
}: {
  titre: string;
  description: string;
  ecrans: readonly EcranPrevu[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Container size="lg" py="lg">
      <Stack gap="md">
        <Title order={2}>{titre}</Title>
        <Text c="dimmed">{description}</Text>
        {children}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {ecrans.map((ecran) => (
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
