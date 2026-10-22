import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ContexteToast } from './toast.ts';
import styles from './Toasts.module.css';

const DUREE_MS = 3000;

/** Fournit `useToast()` à toute l'application et affiche le message en cours. */
export function Toasts({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  const afficher = useCallback((texte: string) => {
    clearTimeout(minuterie.current);
    setMessage(texte);
    minuterie.current = setTimeout(() => setMessage(''), DUREE_MS);
  }, []);

  useEffect(() => () => clearTimeout(minuterie.current), []);

  return (
    <ContexteToast value={afficher}>
      {children}
      {message && <output className={styles.toast}>{message}</output>}
    </ContexteToast>
  );
}
