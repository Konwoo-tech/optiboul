import { changerLangue, initI18n } from '@/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BadgeEtat } from './BadgeEtat.tsx';
import { BasculeApparence } from './BasculeApparence.tsx';
import { Jauge } from './Jauge.tsx';
import { OptiboulProvider } from './OptiboulProvider.tsx';
import { TuileKpi } from './TuileKpi.tsx';

beforeAll(() => {
  initI18n();
});

const dansLeTheme = (enfants: ReactNode) => render(<OptiboulProvider>{enfants}</OptiboulProvider>);
const NIVEAUX = ['ok', 'surveiller', 'bloquant', 'neutre'] as const;

describe('BadgeEtat', () => {
  it.each(NIVEAUX)('affiche toujours le libellé, niveau %s', (niveau) => {
    dansLeTheme(<BadgeEtat niveau={niveau} libelle="Clôturée" />);
    expect(screen.getByText('Clôturée')).toBeTruthy();
  });

  it.each(NIVEAUX)('prend les couleurs du niveau %s', (niveau) => {
    dansLeTheme(<BadgeEtat niveau={niveau} libelle="État" />);
    const style = screen.getByText('État').closest('.mantine-Badge-root')?.getAttribute('style');
    expect(style).toContain(`var(--ob-${niveau}-fond)`);
    expect(style).toContain(`var(--ob-${niveau}-texte)`);
  });
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
  const remplissage = (libelle: string) =>
    screen.getByLabelText(libelle).getAttribute('aria-valuenow');

  it('porte un libellé pour les lecteurs d’écran', () => {
    dansLeTheme(<Jauge valeur={1500} maximum={2000} libelle="Dette de 1 500 sur 2 000 FCFA" />);
    expect(screen.getByLabelText('Dette de 1 500 sur 2 000 FCFA')).toBeTruthy();
    expect(remplissage('Dette de 1 500 sur 2 000 FCFA')).toBe('75');
  });

  it('reste vide à 0 sur 0 et pleine dès qu’il y a quelque chose sans maximum', () => {
    dansLeTheme(
      <>
        <Jauge valeur={0} maximum={0} libelle="Rien" />
        <Jauge valeur={10} maximum={0} libelle="Sans plafond" />
      </>,
    );
    expect(remplissage('Rien')).toBe('0');
    expect(remplissage('Sans plafond')).toBe('100');
  });
});

describe('BasculeApparence', () => {
  const pressé = (nom: string) =>
    screen.getByRole('button', { name: nom }).getAttribute('aria-pressed');

  it('propose la langue et le thème, et change la langue', () => {
    dansLeTheme(<BasculeApparence />);
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));
    expect(screen.getByRole('button', { name: 'Sombre' })).toBeTruthy();
  });

  it('indique le choix courant avec aria-pressed et suit la langue dans <html lang>', () => {
    dansLeTheme(<BasculeApparence />);
    expect(pressé('FR')).toBe('true');
    expect(pressé('EN')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(pressé('EN')).toBe('true');
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'FR' }));
    expect(document.documentElement.lang).toBe('fr');
  });

  it('bascule le thème', () => {
    dansLeTheme(<BasculeApparence />);
    fireEvent.click(screen.getByRole('button', { name: 'Sombre' }));
    expect(pressé('Sombre')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Clair' }));
    expect(pressé('Clair')).toBe('true');
  });

  it('change la langue même si le navigateur refuse de la mémoriser', async () => {
    const refus = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage bloqué');
    });
    await expect(changerLangue('en')).resolves.toBeUndefined();
    await changerLangue('fr');
    refus.mockRestore();
  });
});
