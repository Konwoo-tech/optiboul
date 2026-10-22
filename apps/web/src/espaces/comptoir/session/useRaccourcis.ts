import { actionDeLaTouche, type ActionComptoir } from '@/utils';
import { useEffect, useRef } from 'react';

export type ActionsClavier = Partial<Record<ActionComptoir, () => void>>;

/**
 * Raccourcis du comptoir (F2, F4, F8, Échap), actifs partout dans l'écran, même dans un champ de
 * saisie. Une touche qui n'a pas d'action ne fait rien (elle garde son effet habituel).
 */
export function useRaccourcis(actions: ActionsClavier) {
  // Toujours la dernière version des actions, sans réinstaller l'écouteur à chaque rendu.
  const dernieres = useRef(actions);
  useEffect(() => {
    dernieres.current = actions;
  });

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.altKey || evenement.ctrlKey || evenement.metaKey) return;
      // Échap ferme la liste d'un sélecteur natif : on ne l'annule pas à sa place.
      if (evenement.key === 'Escape' && evenement.target instanceof HTMLSelectElement) return;
      const action = actionDeLaTouche(evenement.key);
      const executer = action ? dernieres.current[action] : undefined;
      if (!executer) return;
      evenement.preventDefault();
      executer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);
}
