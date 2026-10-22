import { Center, Group, Loader, Tabs } from '@mantine/core';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { BandeauHorsLigne, BoutonDeconnexion, EnTeteApplication, LimiteErreur } from '@/ui';
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { espacesDe } from '../profils.ts';

/** Cadre commun : en-tête (qui, où, en ligne), navigation limitée aux espaces du profil. */
export function MiseEnPage() {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const { pathname } = useLocation();
  const naviguer = useNavigate();
  const espaces = espacesDe(utilisateur?.profil);
  const actif = espaces.find((espace) => pathname.startsWith(`/${espace}`)) ?? null;

  return (
    <>
      <EnTeteApplication
        titre={utilisateur?.profil ? t(`profils.${utilisateur.profil}`) : ''}
        actions={
          <Group gap="xs">
            {utilisateur?.name}
            <BoutonDeconnexion />
          </Group>
        }
      />
      <BandeauHorsLigne />
      {espaces.length > 1 && (
        <Tabs value={actif} onChange={(espace) => espace && naviguer(`/${espace}`)} px="md">
          <Tabs.List>
            {espaces.map((espace) => (
              <Tabs.Tab key={espace} value={espace}>
                {t(`espaces.${espace}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      {/* L'en-tête et la navigation restent affichés si un espace plante ou ne se charge pas. */}
      <LimiteErreur reinitialiser={pathname}>
        <Suspense
          fallback={
            <Center py="xl">
              <Loader />
            </Center>
          }
        >
          <Outlet />
        </Suspense>
      </LimiteErreur>
    </>
  );
}
