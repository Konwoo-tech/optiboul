import { Button, Center, Stack, Text, Title } from '@mantine/core';

type Props = {
  titre: string;
  message: string;
  libelleAction: string;
  onAction: () => void;
};

/** Erreur qui bloque l'écran, avec une seule action pour s'en sortir. */
export function EcranErreur({ titre, message, libelleAction, onAction }: Props) {
  return (
    <Center mih="50vh" p="md">
      <Stack align="center" maw={420} role="alert">
        <Title order={2} size="h3">
          {titre}
        </Title>
        <Text c="dimmed" ta="center">
          {message}
        </Text>
        <Button onClick={onAction}>{libelleAction}</Button>
      </Stack>
    </Center>
  );
}
