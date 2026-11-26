import { brouillonsDestroy, brouillonsRetrieve, brouillonsUpdate } from '@/api';
import { useEffect, useRef, useState } from 'react';

const DELAI_MS = 800;

/**
 * Garde une saisie en cours sur le serveur, pour la personne connectée (US-014) : elle la retrouve
 * en revenant sur l'écran, ou après un « Changer d'utilisateur » sur le poste partagé.
 *
 * - À l'ouverture, `restaurer` reçoit le brouillon du serveur, s'il y en a un.
 * - Ensuite, chaque changement de `valeur` est envoyé après un court délai ; une saisie `vide`
 *   supprime le brouillon.
 * - Une erreur réseau n'interrompt jamais l'écran : le brouillon est un confort, pas une donnée.
 */
export function useBrouillon<T>(
  cle: string,
  valeur: T,
  vide: boolean,
  restaurer: (contenu: T) => void,
  actif = true,
) {
  const [pret, setPret] = useState(false);
  const existe = useRef(false);
  const restaurerRef = useRef(restaurer);
  restaurerRef.current = restaurer;

  useEffect(() => {
    if (!actif) return;
    let courant = true;
    brouillonsRetrieve(cle)
      .then((reponse) => {
        if (!courant || reponse.status !== 200) return;
        existe.current = true;
        restaurerRef.current(reponse.data.contenu as T);
      })
      .catch(() => undefined)
      .finally(() => {
        if (courant) setPret(true);
      });
    return () => {
      courant = false;
    };
  }, [cle, actif]);

  useEffect(() => {
    if (!pret || !actif) return;
    if (vide && !existe.current) return;
    const minuterie = setTimeout(() => {
      if (vide) {
        existe.current = false;
        void brouillonsDestroy(cle).catch(() => undefined);
      } else {
        existe.current = true;
        void brouillonsUpdate(cle, { contenu: valeur }).catch(() => undefined);
      }
    }, DELAI_MS);
    return () => clearTimeout(minuterie);
  }, [cle, valeur, vide, pret, actif]);
}
