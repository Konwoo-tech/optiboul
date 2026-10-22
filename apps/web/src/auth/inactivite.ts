import { useEffect, useRef } from 'react';

const EVENEMENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart'] as const;
const CONTROLE_MS = 10_000;

type Options = {
  /** Durée sans activité avant la déconnexion. */
  minutes: number;
  actif: boolean;
  onExpire: () => void;
};

/**
 * Déconnexion automatique après une période sans souris, clavier ni toucher : le poste du
 * comptoir est partagé, une session oubliée ne doit pas rester ouverte (maquette, lignes 1151-1158).
 */
export function useDeconnexionAutomatique({ minutes, actif, onExpire }: Options): void {
  const derniereActivite = useRef(0);
  const expiration = useRef(onExpire);

  useEffect(() => {
    expiration.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!actif) return;
    derniereActivite.current = Date.now();
    const noter = () => {
      derniereActivite.current = Date.now();
    };
    for (const evenement of EVENEMENTS) window.addEventListener(evenement, noter);
    const controle = setInterval(() => {
      if (Date.now() - derniereActivite.current > minutes * 60_000) {
        derniereActivite.current = Date.now();
        expiration.current();
      }
    }, CONTROLE_MS);
    return () => {
      for (const evenement of EVENEMENTS) window.removeEventListener(evenement, noter);
      clearInterval(controle);
    };
  }, [actif, minutes]);
}
