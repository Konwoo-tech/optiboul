import { EcranChargement, LimiteErreur } from '@/ui';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { AccueilDuProfil, EspaceAutorise, RequiertConnexion } from './mise-en-page/Gardes.tsx';
import { MiseEnPage } from './mise-en-page/MiseEnPage.tsx';

// Un espace n'est chargé que lorsqu'on l'ouvre : le comptoir reste léger.
const Connexion = lazy(() => import('./espaces/connexion/Connexion.tsx'));
const Comptoir = lazy(() => import('./espaces/comptoir/Comptoir.tsx'));
const Atelier = lazy(() => import('./espaces/atelier/Atelier.tsx'));
const Gestion = lazy(() => import('./espaces/gestion/Gestion.tsx'));

export function App() {
  return (
    <LimiteErreur>
      <Routes>
        <Route
          path="connexion"
          element={
            <Suspense fallback={<EcranChargement />}>
              <Connexion />
            </Suspense>
          }
        />
        <Route element={<RequiertConnexion />}>
          <Route element={<MiseEnPage />}>
            <Route index element={<AccueilDuProfil />} />
            <Route element={<EspaceAutorise espace="comptoir" />}>
              <Route path="comptoir/*" element={<Comptoir />} />
            </Route>
            <Route element={<EspaceAutorise espace="atelier" />}>
              <Route path="atelier/*" element={<Atelier />} />
            </Route>
            <Route element={<EspaceAutorise espace="gestion" />}>
              <Route path="gestion/*" element={<Gestion />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LimiteErreur>
  );
}
