import { initI18n } from '@/i18n';
import { OptiboulProvider } from '@/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ModaleReception } from './ModaleReception.tsx';
import type { Commande } from './types.ts';

beforeAll(async () => {
  await initI18n('fr').changeLanguage('fr');
});

const commande = {
  numero: 'BC-004',
  fournisseur: '1',
  matiere: 'levure',
  commandee: 4,
  recue: 0,
  jour: '2026-11-20',
  statut: 'planifiee',
  planifieePar: 'Willy Gérant',
  recuePar: '',
  recueLe: null,
  semaine: '',
} as unknown as Commande;

async function ouvrir(onConfirmer: (q: number, o: string, p?: number) => Promise<string | null>) {
  render(
    <OptiboulProvider>
      <ModaleReception
        commande={commande}
        fournisseur={undefined}
        enCours={false}
        avecPrix
        onFermer={() => undefined}
        onConfirmer={onConfirmer}
        onIncomplet={() => undefined}
      />
    </OptiboulProvider>,
  );
  const fenetre = await screen.findByRole('dialog');
  fireEvent.change(within(fenetre).getByLabelText(/Prix unitaire/), { target: { value: '2,5' } });
  fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
  return fenetre;
}

describe('réception : prix à l’unité du stock', () => {
  it('le prix se donne par gramme pour la levure et accepte une décimale (2,5)', async () => {
    const surConfirmer = vi.fn().mockResolvedValue(null);
    const fenetre = await ouvrir(surConfirmer);
    expect(within(fenetre).getByText(/Prix unitaire \(FCFA par g\)/)).toBeTruthy();
    await waitFor(() => expect(surConfirmer).toHaveBeenCalledWith(4, '', 2.5));
  });

  it('un prix à la décimale refusé par le serveur est expliqué dans la fenêtre', async () => {
    await ouvrir(vi.fn().mockResolvedValue('prix_decimal'));
    expect(await screen.findByText(/n’accepte pas encore un prix à la décimale/)).toBeTruthy();
  });
});
