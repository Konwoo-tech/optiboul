import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FenetreModale } from './FenetreModale.tsx';

function Page({ onFermer = () => {} }: { onFermer?: () => void }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuverte(true)}>
        Ouvrir
      </button>
      {ouverte && (
        <FenetreModale
          titre="Ouverture de caisse"
          onFermer={() => {
            onFermer();
            setOuverte(false);
          }}
        >
          <input aria-label="Fonds" />
          <button type="button">Annuler</button>
          <button type="button">Confirmer</button>
        </FenetreModale>
      )}
    </>
  );
}

const ouvrir = () => {
  const declencheur = screen.getByRole('button', { name: 'Ouvrir' });
  declencheur.focus();
  fireEvent.click(declencheur);
  return declencheur;
};

describe('fenêtre modale', () => {
  it('est un dialogue modal nommé par son titre', () => {
    render(<Page />);
    ouvrir();
    const dialogue = screen.getByRole('dialog', { name: 'Ouverture de caisse' });
    expect(dialogue.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Ouverture de caisse' })).toBeTruthy();
  });

  it('prend le focus à l’ouverture, sur la fenêtre elle-même', () => {
    render(<Page />);
    ouvrir();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('garde le focus dedans avec Tab et Maj+Tab', () => {
    render(<Page />);
    ouvrir();
    const champ = screen.getByRole('textbox', { name: 'Fonds' });
    const confirmer = screen.getByRole('button', { name: 'Confirmer' });
    confirmer.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(champ);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmer);
  });

  it('Échap la ferme et rend le focus au bouton qui l’a ouverte', () => {
    const onFermer = vi.fn();
    render(<Page onFermer={onFermer} />);
    const declencheur = ouvrir();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(declencheur);
  });

  it('si le bouton a disparu à la fermeture, le focus passe au titre de la page', () => {
    function Disparait() {
      const [etat, setEtat] = useState<'ferme' | 'ouvert' | 'fait'>('ferme');
      return (
        <>
          <h1>Caisses</h1>
          {etat === 'ferme' && (
            <button type="button" onClick={() => setEtat('ouvert')}>
              Ouvrir
            </button>
          )}
          {etat === 'ouvert' && (
            <FenetreModale titre="Ouverture" onFermer={() => setEtat('fait')}>
              <button type="button">Confirmer</button>
            </FenetreModale>
          )}
        </>
      );
    }
    render(<Disparait />);
    const declencheur = screen.getByRole('button', { name: 'Ouvrir' });
    declencheur.focus();
    fireEvent.click(declencheur);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(declencheur.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Caisses' }));
  });

  it('un clic hors de la fenêtre la ferme, un clic dedans non', () => {
    const onFermer = vi.fn();
    const { container } = render(<Page onFermer={onFermer} />);
    ouvrir();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onFermer).not.toHaveBeenCalled();
    fireEvent.click(container.ownerDocument.querySelector('[aria-hidden="true"]')!);
    expect(onFermer).toHaveBeenCalledTimes(1);
  });
});
