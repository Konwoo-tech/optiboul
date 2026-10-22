import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './Fenetre.module.css';

type Props = {
  titre: string;
  /** Largeur maximale, en pixels (420 pour le bon, 480 sinon, comme la maquette). */
  largeur?: number;
  onFermer: () => void;
  children: ReactNode;
};

const FOCALISABLES = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]';

/**
 * Fenêtre modale : voile sombre (un clic dessus la ferme), titre, focus dans la fenêtre et rendu
 * au champ précédent à la fermeture. Échap la ferme via les raccourcis du comptoir.
 */
export function Fenetre({ titre, largeur = 480, onFermer, children }: Props) {
  const identifiant = useId();
  const fenetre = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const precedent = document.activeElement;
    const champ = fenetre.current?.querySelector<HTMLElement>('input:not(:disabled)');
    (champ ?? fenetre.current?.querySelector<HTMLElement>(FOCALISABLES))?.focus();

    // Tab reste dans la fenêtre : le comptoir se pilote au clavier, le focus ne doit pas s'échapper.
    const garderLeFocus = (evenement: KeyboardEvent) => {
      if (evenement.key !== 'Tab') return;
      const champs = Array.from(fenetre.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? []);
      const premier = champs[0];
      const dernier = champs[champs.length - 1];
      if (!premier || !dernier) return;
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', garderLeFocus);
    return () => {
      document.removeEventListener('keydown', garderLeFocus);
      if (precedent instanceof HTMLElement && document.contains(precedent)) precedent.focus();
    };
  }, []);

  return createPortal(
    <div className={styles.voile}>
      {/* Le fond est un vrai bouton : un clic à côté de la fenêtre la ferme. */}
      <button type="button" className={styles.fond} tabIndex={-1} aria-hidden onClick={onFermer} />
      <dialog
        open
        ref={fenetre}
        className={styles.fenetre}
        style={{ maxWidth: largeur }}
        aria-modal="true"
        aria-labelledby={identifiant}
      >
        <div className={styles.titre} id={identifiant}>
          {titre}
        </div>
        {children}
      </dialog>
    </div>,
    document.body,
  );
}
