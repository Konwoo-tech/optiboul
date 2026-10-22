import { configurerApi, creerClientRequetes } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee, SIMULATION } from '@/simulation';
import { OptiboulProvider } from '@/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App.tsx';

initI18n();
configurerApi({ application: 'web' });
// `pnpm dev:simulation` : l'application tourne sans backend, sur de fausses réponses de l'API.
if (SIMULATION) installerApiSimulee();

const queryClient = creerClientRequetes();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptiboulProvider sombreLaNuit>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </OptiboulProvider>
  </StrictMode>,
);
