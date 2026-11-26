import { initI18n } from '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CommeCommande } from './CommeCommande.tsx';

beforeAll(() => {
  initI18n('fr');
});
afterEach(cleanup);

function afficher(sansPrix: string[], onLivrer = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CommeCommande
        clientId="1"
        commande="100 BAG · 30 PL"
        occupe={false}
        sansPrix={sansPrix}
        onLivrer={onLivrer}
      />
    </QueryClientProvider>,
  );
  return onLivrer;
}

describe('Livrer comme commandé', () => {
  it('livre d’un geste quand tous les produits commandés ont un prix', () => {
    const onLivrer = afficher([]);
    const bouton = screen.getByRole('button', {
      name: 'Livrer comme commandé',
    }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);
    expect(onLivrer).toHaveBeenCalledTimes(1);
  });

  it('se désactive et dit quel prix manque', () => {
    const onLivrer = afficher(['PL', 'PC']);
    const bouton = screen.getByRole('button', {
      name: 'Livrer comme commandé',
    }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(screen.getByRole('note').textContent).toBe(
      'Pas de prix pour PL, PC : fixez-le dans la fiche du client pour livrer comme commandé.',
    );
    expect(bouton.getAttribute('aria-describedby')).toBe(screen.getByRole('note').id);
    fireEvent.click(bouton);
    expect(onLivrer).not.toHaveBeenCalled();
  });
});
