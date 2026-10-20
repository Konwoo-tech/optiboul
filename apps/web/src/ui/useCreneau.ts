import { creneauDe, type Creneau } from '@/utils';
import { useEffect, useState } from 'react';

/** Créneau courant (jour / nuit), réévalué chaque minute : bascule seul à 06:00 et 18:00. */
export function useCreneau(): Creneau {
  const [creneau, setCreneau] = useState<Creneau>(() => creneauDe(new Date()));
  useEffect(() => {
    const minuterie = setInterval(() => setCreneau(creneauDe(new Date())), 60_000);
    return () => clearInterval(minuterie);
  }, []);
  return creneau;
}
