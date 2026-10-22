import { Alert, Button, Center, Paper, Stack, Text, Title } from '@mantine/core';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { BasculeApparence } from '@/ui';
import { cheminSuivant } from '@/utils';
import { Navigate, useSearchParams } from 'react-router';

import { PROFILS } from '../../profils.ts';

/**
 * Connexion. En attendant les écrans dédiés (US-010 code à 4 chiffres, US-011 double
 * authentification), le bouton ouvre la connexion django-allauth sur la même origine.
 */
export default function Connexion() {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const [parametres] = useSearchParams();
  const suivant = cheminSuivant(parametres.get('suivant'));

  if (utilisateur?.profil) {
    return <Navigate to={suivant ?? PROFILS[utilisateur.profil].accueil} replace />;
  }

  return (
    <Center mih="100vh" bg="var(--ob-fond)" p="md">
      <Paper withBorder shadow="sm" p="xl" w={420} maw="100%" bg="var(--ob-surface)">
        <Stack>
          <BasculeApparence />
          <Title order={1} c="var(--ob-marque)">
            OptiBoul
          </Title>
          <Title order={2} size="h3">
            {t('connexion.titre')}
          </Title>
          {utilisateur ? (
            <Alert color="yellow">{t('connexion.aucunProfil')}</Alert>
          ) : (
            <>
              <Text c="dimmed" size="sm">
                Boulangerie du Faubourg · Etoudi
              </Text>
              <Button
                component="a"
                href={`/accounts/login/?next=${encodeURIComponent(suivant ?? '/')}`}
              >
                {t('connexion.seConnecter')}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
