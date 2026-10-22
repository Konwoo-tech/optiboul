import { createContext, useContext } from 'react';

/** Affiche un message bref en bas de l'écran pendant 3 secondes. */
export type AfficherToast = (message: string) => void;

export const ContexteToast = createContext<AfficherToast>(() => {});

export function useToast(): AfficherToast {
  return useContext(ContexteToast);
}
