import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

import { declarerComptesDeDepart } from '../simulation/comptes.ts';
import { COMPTES_SIMULES, GROUPES_SIMULES } from '../simulation/donnees.ts';

// Les comptes de démonstration sont déclarés par le routeur simulé ; les tests qui lisent un module
// de simulation sans passer par lui les trouvent ici.
declarerComptesDeDepart(COMPTES_SIMULES, GROUPES_SIMULES);

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
