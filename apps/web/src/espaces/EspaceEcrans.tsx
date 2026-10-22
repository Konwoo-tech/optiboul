import { useUtilisateurCourant } from '@/auth';
import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { cheminEcran, ecranAccueil, ecransDe, type Ecran } from '../navigation.ts';
import type { Espace } from '../profils.ts';
import { EcranPrevu } from './EcranPrevu.tsx';

type EcranLivre = ComponentType<{ ecran: Ecran }>;

/**
 * Les écrans construits lisent l'API simulée : hors simulation, la page d'attente s'affiche.
 * ATTENTION : chaque entrée de `ECRANS_LIVRES` doit être gardée par `EN_SIMULATION`. Un
 * `lazy(import(...))` sans garde embarquerait l'écran dans le paquet de production. (Une fonction
 * `enSimulation(() => import(...))` ne suffit pas : le compilateur ne retire pas l'import.)
 * `pnpm verifier:fuite`, à lancer après `pnpm build`, détecte une fuite.
 */
const EN_SIMULATION = import.meta.env.MODE === 'simulation';

/**
 * Écrans déjà construits, une entrée par ligne, triées. Clé `espace/écran` : un écran peut donc
 * différer d'un espace à l'autre. Ajouter un écran = ajouter une ligne.
 */
const ECRANS_LIVRES: Record<string, EcranLivre | null> = {
  'comptoir/clients': EN_SIMULATION ? lazy(() => import('./clients/EcranClients.tsx')) : null,
  'gestion/clients': EN_SIMULATION ? lazy(() => import('./clients/EcranClients.tsx')) : null,
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
