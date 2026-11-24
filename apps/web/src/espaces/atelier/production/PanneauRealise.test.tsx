import { initI18n } from '@/i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PanneauRealise } from './PanneauRealise.tsx';
import type { Plan } from './types.ts';

beforeAll(async () => {
  await initI18n('fr').changeLanguage('fr');
});

const ligne = { pains: 0, base: 0, supplement: 0, sacs: 1, prevus: 315, boules: 16 };
const plan: Plan = {
  lignes: { BAG: ligne, KO: ligne, GC: ligne },
  sacs: 3,
  prevus: 945,
  supplement: 0,
};
const valeurs = { BAG: '160', KO: '', GC: '' };
const fournee = { numero: 2, produit: 'BAG' as const, pains: 60, a: '07:30' };

const afficher = (reste: Partial<Parameters<typeof PanneauRealise>[0]> = {}) => {
  const annuler = vi.fn();
  render(
    <PanneauRealise
      plan={plan}
      valeurs={valeurs}
      lectureSeule={null}
      occupe={false}
      onChange={() => undefined}
      onEnregistrer={() => undefined}
      derniereFournee={fournee}
      onAnnulerFournee={annuler}
      {...reste}
    />,
  );
  return annuler;
};

describe('annuler la dernière fournée', () => {
  it('demande confirmation, puis annule la fournée désignée', () => {
    const annuler = afficher();
    expect(screen.getByText(/Dernière fournée : 60 BAG à 07:30/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler cette fournée' }));
    expect(annuler).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Oui, annuler la fournée' }));
    expect(annuler).toHaveBeenCalledWith(2);
  });

  it('« Non, la garder » ferme la confirmation sans rien annuler', () => {
    const annuler = afficher();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler cette fournée' }));
    fireEvent.click(screen.getByRole('button', { name: 'Non, la garder' }));
    expect(annuler).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Annuler cette fournée' })).toBeTruthy();
  });

  it('rien à annuler en lecture seule, ni sans fournée', () => {
    afficher({ lectureSeule: 'responsable' });
    expect(screen.queryByRole('button', { name: 'Annuler cette fournée' })).toBeNull();
  });

  it('rien à annuler sans fournée', () => {
    afficher({ derniereFournee: null });
    expect(screen.queryByRole('button', { name: 'Annuler cette fournée' })).toBeNull();
  });
});
