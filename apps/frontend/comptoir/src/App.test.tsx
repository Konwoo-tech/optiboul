import { initI18n } from '@optiboul/i18n';
import { OptiboulProvider } from '@optiboul/ui';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';

import { App } from './App.tsx';
import { ECRANS } from './ecrans.ts';

it('affiche les écrans prévus', () => {
  initI18n();
  render(
    <OptiboulProvider>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </OptiboulProvider>,
  );
  for (const ecran of ECRANS) {
    expect(screen.getByText(ecran.recit, { exact: false })).toBeTruthy();
  }
});
