import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { MontantFCFA } from './MontantFCFA.tsx';

it('affiche le montant formaté en FCFA', () => {
  render(
    <MantineProvider>
      <MontantFCFA montant={-2000} />
    </MantineProvider>,
  );
  expect(screen.getByText(/2\s000\sFCFA/)).toBeTruthy();
});
