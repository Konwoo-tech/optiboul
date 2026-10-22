import { useEffect, useState } from 'react';

/** Date courante, rafraîchie toutes les 10 secondes (l'horloge n'affiche pas les secondes). */
export function useHorloge(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(new Date()), 10_000);
    return () => clearInterval(minuterie);
  }, []);
  return maintenant;
}
