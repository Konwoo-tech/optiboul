import { initI18n } from '@/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FicheEmploye } from './FicheEmploye.tsx';
import { DEPART } from './instantanes.test-donnees.ts';
import { droitsPaie } from './regles.ts';
import type { InstantanePaie } from './types.ts';

beforeAll(() => {
  initI18n('fr');
});
afterEach(cleanup);

function afficher(instantane: InstantanePaie) {
  render(
    <FicheEmploye
      instantane={instantane}
      employe={instantane.employes[0]!}
      droits={droitsPaie('gerant')}
      occupe={false}
      erreurServeur={null}
      mode="especes"
      montantPaye=""
      onMode={vi.fn()}
      reference=""
      referenceManquante={false}
      onReference={vi.fn()}
      onMontantPaye={vi.fn()}
      onAjouter={vi.fn(async () => true)}
      onRetirer={vi.fn()}
      onRetenues={vi.fn()}
      onPayer={vi.fn()}
      onModifier={vi.fn()}
    />,
  );
}

describe('Fiche employé avant la préparation de l’état de paie', () => {
  it('ne propose pas la saisie d’une ligne et dit de préparer l’état', () => {
    afficher({ ...DEPART, statut: 'brouillon', aPreparer: '2026-12' });
    expect(screen.queryByRole('button', { name: 'Ajouter la ligne' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer les retenues' })).toBeNull();
    expect(screen.getByText(/Préparez d’abord l’état de paie du mois/)).toBeTruthy();
  });

  it('propose la saisie quand l’état est préparé', () => {
    afficher({ ...DEPART, statut: 'brouillon', aPreparer: null });
    expect(screen.getByRole('button', { name: 'Ajouter la ligne' })).toBeTruthy();
  });
});
