import { useUtilisateurCourant } from '@/auth';
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { cheminEcran, ecranAccueil, ecransDe, type Ecran } from '../navigation.ts';
import type { Espace } from '../profils.ts';
import { EcranPrevu } from './EcranPrevu.tsx';

type EcranLivre = ComponentType<{ ecran: Ecran }>;

/**
 * Tous les écrans construits sont branchés sur le vrai serveur (intégration par étapes, ticket #292).
 * ATTENTION : un écran qui ne lirait que l'API simulée doit être gardé par
 * `import.meta.env.MODE === 'simulation' ? lazy(() => import(...)) : null` : un `lazy(import(...))`
 * sans garde l'embarquerait dans le paquet de production. `pnpm verifier:fuite`, à lancer après
 * `pnpm build`, détecte une fuite.
 */

/**
 * Écrans déjà construits, une entrée par ligne, triées. Clé `espace/écran` : un écran peut donc
 * différer d'un espace à l'autre. Ajouter un écran = ajouter une ligne.
 */
const ECRANS_LIVRES: Record<string, EcranLivre | null> = {
  'atelier/production': lazy(() => import('./atelier/production/EcranProduction.tsx')),
  'atelier/semaines': lazy(() => import('./gestion/semaines/EcranSemaines.tsx')),
  'atelier/stocks': lazy(() => import('./atelier/stocks/EcranStocks.tsx')),
  'comptoir/caisses': lazy(() => import('./comptoir/caisses/Ecran.tsx')),
  // Branché sur le vrai serveur (#268) : sans garde.
  'comptoir/clients': lazy(() => import('./clients/EcranClients.tsx')),
  'comptoir/demandes': lazy(() => import('./comptoir/demandes/Ecran.tsx')),
  'comptoir/depenses': lazy(() => import('./comptoir/depenses/EcranDepenses.tsx')),
  'comptoir/session': lazy(() => import('./comptoir/session/SessionComptoir.tsx')),
  'gestion/clients': lazy(() => import('./clients/EcranClients.tsx')),
  'gestion/demandes': lazy(() => import('./comptoir/demandes/Ecran.tsx')),
  'gestion/depenses': lazy(() => import('./comptoir/depenses/EcranDepenses.tsx')),
  'gestion/journal': lazy(() => import('./gestion/journal/EcranJournal.tsx')),
  'gestion/personnel': lazy(() => import('./gestion/personnel/EcranPersonnel.tsx')),
  'gestion/fournisseurs': lazy(() => import('./gestion/fournisseurs/EcranFournisseurs.tsx')),
  'gestion/sauvegardes': lazy(() => import('./gestion/sauvegardes/EcranSauvegardes.tsx')),
  'gestion/utilisateurs': lazy(() => import('./gestion/utilisateurs/EcranUtilisateurs.tsx')),
  'gestion/tableau-de-bord': lazy(() => import('./gestion/tableau-de-bord/EcranTableauDeBord.tsx')),
  'gestion/parametres': lazy(() => import('./gestion/parametres/EcranParametres.tsx')),
  'gestion/semaines': lazy(() => import('./gestion/semaines/EcranSemaines.tsx')),
};

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
        const Livre = ECRANS_LIVRES[`${ecran.espace}/${ecran.cle}`];
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
