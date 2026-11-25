import { getUsersMeRetrieveQueryKey, usersMePartialUpdate, type PatchedPreferences } from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { changerLangue, type Langue } from '@/i18n';
import { useMantineColorScheme } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

/*
 * Thème et langue mémorisés par personne (US-004) : sur un poste partagé, la préférence de l'une ne
 * s'impose pas à la suivante. À la connexion, on applique ceux de la personne ; à chaque bascule, on
 * les enregistre (`PATCH /users/me/`). Le navigateur ne retient plus que ceux d'avant la connexion.
 */

/** Thème du serveur → thème de l'écran ; `auto` : le thème par défaut (sombre pendant la nuit, O16). */
export const THEME_DE_L_ECRAN = { clair: 'light', sombre: 'dark', auto: null } as const;
export const THEME_DU_SERVEUR = { light: 'clair', dark: 'sombre' } as const;

/** Applique le thème et la langue de la personne connectée, une fois par personne. */
export function useAppliquerPreferences() {
  const { utilisateur } = useUtilisateurCourant();
  const { setColorScheme, clearColorScheme } = useMantineColorScheme();
  const appliquee = useRef<number | null>(null);
  useEffect(() => {
    if (!utilisateur || appliquee.current === utilisateur.id) return;
    appliquee.current = utilisateur.id;
    if (utilisateur.langue === 'fr' || utilisateur.langue === 'en') {
      void changerLangue(utilisateur.langue as Langue);
    }
    const theme = utilisateur.theme ? THEME_DE_L_ECRAN[utilisateur.theme] : undefined;
    if (theme) setColorScheme(theme);
    else if (theme === null) clearColorScheme();
  }, [utilisateur, setColorScheme, clearColorScheme]);
}

/** Enregistre une préférence de la personne connectée ; sans session, rien (le navigateur la retient). */
export function useEnregistrerPreferences() {
  const client = useQueryClient();
  const { utilisateur } = useUtilisateurCourant();
  const connecte = Boolean(utilisateur);
  return useCallback(
    (preference: PatchedPreferences) => {
      if (!connecte) return;
      void usersMePartialUpdate(preference)
        .then(() =>
          client.setQueryData(
            getUsersMeRetrieveQueryKey(),
            (avant: { data?: object } | undefined) =>
              avant ? { ...avant, data: { ...avant.data, ...preference } } : avant,
          ),
        )
        // Mémorisation impossible (hors ligne…) : la préférence reste active sur ce navigateur.
        .catch(() => undefined);
    },
    [client, connecte],
  );
}
