import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans les « globals » de Vitest, Testing Library ne nettoie pas seule le DOM entre deux tests.
afterEach(cleanup);

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
