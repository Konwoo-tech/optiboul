import '@fontsource-variable/manrope';
import '@mantine/core/styles.css';

import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';

import { themeOptiboul } from './theme.ts';
import { useCreneau } from './useCreneau.ts';

type Props = {
  children: ReactNode;
  /** Thème sombre proposé pendant la session de nuit (O16). */
  sombreLaNuit?: boolean;
};

export function OptiboulProvider({ children, sombreLaNuit = false }: Props) {
  const creneau = useCreneau();
  const nuit = sombreLaNuit && creneau === 'nuit';
  return (
    <MantineProvider theme={themeOptiboul} defaultColorScheme={nuit ? 'dark' : 'light'}>
      {children}
    </MantineProvider>
  );
}
