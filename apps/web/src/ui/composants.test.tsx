import { initI18n } from '@/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { BadgeEtat } from './BadgeEtat.tsx';
import { BasculeApparence } from './BasculeApparence.tsx';
import { Jauge } from './Jauge.tsx';
import { OptiboulProvider } from './OptiboulProvider.tsx';
import { TuileKpi } from './TuileKpi.tsx';

beforeAll(() => {
  initI18n();
});

const dansLeTheme = (enfants: ReactNode) => render(<OptiboulProvider>{enfants}</OptiboulProvider>);

describe('BadgeEtat', () => {
  it.each(['ok', 'surveiller', 'bloquant', 'neutre'] as const)(
    'affiche toujours le libellé, niveau %s',
    (niveau) => {
      dansLeTheme(<BadgeEtat niveau={niveau} libelle="Clôturée" />);
      expect(screen.getByText('Clôturée')).toBeTruthy();
    },
  );
});

describe('TuileKpi', () => {
  it('affiche le libellé, la valeur et le détail', () => {
    dansLeTheme(
      <TuileKpi libelle="Dettes clients" valeur="4 337 800" detail="3 au-delà du plafond" />,
    );
    expect(screen.getByText('Dettes clients')).toBeTruthy();
    expect(screen.getByText('4 337 800')).toBeTruthy();
    expect(screen.getByText('3 au-delà du plafond')).toBeTruthy();
  });
});

describe('Jauge', () => {
  it('porte un libellé pour les lecteurs d’écran', () => {
    dansLeTheme(<Jauge valeur={1500} maximum={2000} libelle="Dette de 1 500 sur 2 000 FCFA" />);
    expect(screen.getByLabelText('Dette de 1 500 sur 2 000 FCFA')).toBeTruthy();
  });
});

describe('BasculeApparence', () => {
  it('propose la langue et le thème, et change la langue', () => {
    dansLeTheme(<BasculeApparence />);
    expect(screen.getByRole('button', { name: 'EN' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));
    expect(screen.getByRole('button', { name: 'Sombre' })).toBeTruthy();
  });
});
