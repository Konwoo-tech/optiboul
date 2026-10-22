import { useUtilisateurCourant } from '@/auth';
import { Navigate, Route, Routes } from 'react-router';

import { cheminEcran, ecranAccueil, ecransDe } from '../navigation.ts';
import type { Espace } from '../profils.ts';
import { EcranPrevu } from './EcranPrevu.tsx';

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
      {ecransDe(profil, espace).map((ecran) => (
        <Route key={ecran.cle} path={ecran.cle} element={<EcranPrevu ecran={ecran} />} />
      ))}
      <Route path="*" element={versAccueil} />
    </Routes>
  );
}
