import { initI18n } from '@/i18n';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Paginee } from './Pagination.tsx';

beforeAll(() => {
  initI18n('fr');
});
afterEach(cleanup);

const ELEMENTS = Array.from({ length: 23 }, (_, i) => `ligne ${i + 1}`);

const liste = (visibles: readonly string[]) => (
  <ul>
    {visibles.map((v) => (
      <li key={v}>{v}</li>
    ))}
  </ul>
);

describe('Pagination', () => {
  it('découpe par dix, avance et recule, et désactive les bornes', () => {
    render(<Paginee elements={ELEMENTS}>{liste}</Paginee>);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Page 1 sur 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Précédent' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Page 3 sur 3')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
  });

  it('ne montre rien de plus quand tout tient sur une page', () => {
    render(<Paginee elements={ELEMENTS.slice(0, 5)}>{liste}</Paginee>);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('revient à la première page quand le filtre change, et à la dernière si la liste raccourcit', () => {
    const { rerender } = render(
      <Paginee elements={ELEMENTS} cle="a">
        {liste}
      </Paginee>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('Page 2 sur 3')).toBeTruthy();
    rerender(
      <Paginee elements={ELEMENTS.slice(0, 12)} cle="a">
        {liste}
      </Paginee>,
    );
    expect(screen.getByText('Page 2 sur 2')).toBeTruthy();
    rerender(
      <Paginee elements={ELEMENTS} cle="b">
        {liste}
      </Paginee>,
    );
    expect(screen.getByText('Page 1 sur 3')).toBeTruthy();
  });
});
