import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from './FenetreModale.module.css';

type Props = {
  titre: string;
  onFermer: () => void;
  /** Largeur maximale en pixels : 480 dans la maquette, 420 pour un bon de livraison. */
  largeurMax?: number;
  children: ReactNode;
};

const CIBLES =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Fenêtre modale de la maquette « OptiBoul ERP v2 » (lignes 977-1062) : voile sombre, fenêtre de
 * 18 px d'arrondi centrée. À l'ouverture le focus entre dans la fenêtre (sur la fenêtre elle-même,
 * sans anneau), Tab reste à l'intérieur, Échap la ferme et le focus revient là où il était.
 * Le parent la monte seulement quand elle est ouverte. Une seule modale à la fois : pas de pile
 * (une modale ouverte depuis une autre se disputerait Échap et le piège du focus). Une seule modale à la fois : pas de pile
 * (une modale ouverte depuis une autre se disputerait Échap et le piège du focus).
 */
export function FenetreModale({ titre, onFermer, largeurMax = 480, children }: Props) {
  const idTitre = useId();
  const fenetre = useRef<HTMLDialogElement>(null);
  // Le parent recrée `onFermer` à chaque rendu : l'effet ne doit se jouer qu'à l'ouverture.
  const fermer = useRef(onFermer);
  useEffect(() => {
    fermer.current = onFermer;
  }, [onFermer]);

  useEffect(() => {
    const declencheur =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    fenetre.current?.focus();
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        // Échap referme la liste d'un sélecteur natif : il ne ferme pas la fenêtre à sa place.
        if (evenement.target instanceof HTMLSelectElement) return;
        fermer.current();
        return;
      }
      if (evenement.key !== 'Tab' || !fenetre.current) return;
      const cibles = [...fenetre.current.querySelectorAll<HTMLElement>(CIBLES)];
      const premiere = cibles[0];
      const derniere = cibles[cibles.length - 1];
      if (!premiere || !derniere) {
        evenement.preventDefault();
        return;
      }
      const actif = document.activeElement;
      if (evenement.shiftKey && (actif === premiere || actif === fenetre.current)) {
        evenement.preventDefault();
        derniere.focus();
      } else if (!evenement.shiftKey && actif === derniere) {
        evenement.preventDefault();
        premiere.focus();
      } else if (!fenetre.current.contains(actif)) {
        evenement.preventDefault();
        premiere.focus();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
      if (declencheur?.isConnected) {
        declencheur.focus();
      } else {
        // Le bouton a disparu (ex. « Ouvrir la caisse » remplacé par la bannière) : le focus
        // se pose sur le titre de la page plutôt que de se perdre dans le document.
        const titrePage = document.querySelector<HTMLElement>('h1');
        titrePage?.setAttribute('tabindex', '-1');
        titrePage?.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div className={styles.voile}>
      <div className={styles.fond} onClick={onFermer} aria-hidden />
      <dialog
        open
        ref={fenetre}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={idTitre}
        className={styles.fenetre}
        style={{ maxWidth: largeurMax }}
      >
        <h2 id={idTitre} className={styles.titre}>
          {titre}
        </h2>
        {children}
      </dialog>
    </div>
  );
}
