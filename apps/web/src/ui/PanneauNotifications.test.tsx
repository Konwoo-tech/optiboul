import { initI18n } from '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OptiboulProvider } from './OptiboulProvider.tsx';
import { PanneauNotifications } from './PanneauNotifications.tsx';

beforeAll(() => {
  initI18n();
});
afterEach(() => vi.restoreAllMocks());

function Cadre({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  return (
    <OptiboulProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <button type="button">Déclencheur</button>
          <PanneauNotifications ouvert={ouvert} onFermer={onFermer} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>
  );
}

describe('tiroir de notifications', () => {
  it('est un dialogue modal, nommé, avec une règle et un état vide', () => {
    render(<Cadre ouvert onFermer={() => {}} />);
    const dialogue = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialogue.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Aucune notification.')).toBeTruthy();
  });

  it('prend le focus à l’ouverture sans le reprendre à chaque rendu du parent', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<Cadre ouvert onFermer={() => {}} />);
    const apresOuverture = focus.mock.calls.length;
    expect(apresOuverture).toBeGreaterThan(0);
    // Le parent recrée onFermer à chaque rendu (ici, l'horloge toutes les 10 s).
    rerender(<Cadre ouvert onFermer={() => {}} />);
    rerender(<Cadre ouvert onFermer={() => {}} />);
    expect(focus.mock.calls.length).toBe(apresOuverture);
  });

  it('Échap appelle la dernière fonction de fermeture', () => {
    const premiere = vi.fn();
    const derniere = vi.fn();
    const { rerender } = render(<Cadre ouvert onFermer={premiere} />);
    rerender(<Cadre ouvert onFermer={derniere} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(derniere).toHaveBeenCalledTimes(1);
    expect(premiere).not.toHaveBeenCalled();
  });

  it('rend le focus au bouton qui l’a ouvert', () => {
    const { rerender } = render(<Cadre ouvert={false} onFermer={() => {}} />);
    const declencheur = screen.getByRole('button', { name: 'Déclencheur' });
    declencheur.focus();
    rerender(<Cadre ouvert onFermer={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer' }));
    rerender(<Cadre ouvert={false} onFermer={() => {}} />);
    expect(document.activeElement).toBe(declencheur);
  });

  it('garde le focus dans le tiroir avec Tab', () => {
    render(<Cadre ouvert onFermer={() => {}} />);
    const fermer = screen.getByRole('button', { name: 'Fermer' });
    expect(document.activeElement).toBe(fermer);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(fermer);
  });

  it('accorde « notification » et « non lue » au singulier et au pluriel', () => {
    const t = initI18n('fr').t.bind(initI18n('fr'));
    expect(`${t('coque.vue.nombre', { count: 1 })} · ${t('coque.vue.nonLues', { count: 1 })}`).toBe(
      '1 notification · 1 non lue',
    );
    expect(`${t('coque.vue.nombre', { count: 4 })} · ${t('coque.vue.nonLues', { count: 3 })}`).toBe(
      '4 notifications · 3 non lues',
    );
  });
});
