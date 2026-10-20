import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App.tsx';

initI18n();
configurerApi({ application: 'web' });

// Pas de mutation optimiste sur les écrans d'argent (spécification technique §9.2).
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

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
