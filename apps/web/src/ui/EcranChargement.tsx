import { Center, Loader } from '@mantine/core';

/** Chargement en plein écran (session, première page). */
export function EcranChargement() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}
