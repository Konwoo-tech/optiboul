import { useUtilisateurCourant } from '@/auth';
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { cheminEcran, ecranAccueil, ecransDe, type CleEcran, type Ecran } from '../navigation.ts';
import type { Espace } from '../profils.ts';
import { EcranPrevu } from './EcranPrevu.tsx';

/**
 * Écrans déjà construits, servis par un seul composant pour tous les espaces qui les listent.
 * Pour l'instant ils lisent l'API simulée : hors simulation, la page d'attente s'affiche
 * (la condition lit `import.meta.env.MODE` ici même, pour que le compilateur retire l'import).
 */
const ECRANS_LIVRES: Partial<Record<CleEcran, ComponentType<{ ecran: Ecran }>>> =
  import.meta.env.MODE === 'simulation'
    ? { clients: lazy(() => import('./clients/EcranClients.tsx')) }
    : {};

/**
 * Écrans d'un espace pour le profil connecté : `/comptoir` ouvre l'écran d'accueil du profil,
 * un écran qu'il ne voit pas renvoie à cet accueil.
 */
export function EspaceEcrans({ espace }: { espace: Espace }) {
  const { utilisateur } = useUtilisateurCourant();
  const profil = utilisateur?.profil;
  const accueil = ecranAccueil(profil, espace);
  const versAccueil = accueil ? <Navigate to={cheminEcran(accueil)} replace /> : null;

  return (
    <Routes>
      <Route index element={versAccueil} />
      {ecransDe(profil, espace).map((ecran) => {
        const Livre = ECRANS_LIVRES[ecran.cle];
        return (
          <Route
            key={ecran.cle}
            path={ecran.cle}
            element={
              Livre ? (
                <Suspense fallback={null}>
                  <Livre ecran={ecran} />
                </Suspense>
              ) : (
                <EcranPrevu ecran={ecran} />
              )
            }
          />
        );
      })}
      <Route path="*" element={versAccueil} />
    </Routes>
  );
}
