import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans les « globals » de Vitest, Testing Library ne nettoie pas seule le DOM entre deux tests.
afterEach(cleanup);

// Les pages se chargent à la demande (import dynamique) : 1 s, l'attente par défaut, ne suffit pas
// quand le poste ou le serveur d'intégration est chargé. Les tests qui réussissent n'attendent pas plus.
configure({ asyncUtilTimeout: 5000 });

// Polyfills jsdom nécessaires à Mantine.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class ResizeObserverFactice {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverFactice;
