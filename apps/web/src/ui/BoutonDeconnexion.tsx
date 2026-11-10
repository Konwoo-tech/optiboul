import { connexionChangerUtilisateurCreate, connexionDeconnexionCreate } from '@/api';
import { useTranslation } from '@/i18n';
import { deconnecterSimulation, SIMULATION } from '@/simulation';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useToast } from './toast.ts';

type Props = {
  libelle?: string;
  className?: string;
  /**
   * `changer` : « Changer d'utilisateur » — la session se ferme, le poste et les brouillons
   * restent. `deconnexion` : fermeture simple de la session.
   */
  action?: 'deconnexion' | 'changer';
};

/**
 * Ferme la session sur le vrai serveur (`POST /connexion/deconnexion/` ou
 * `/connexion/changer-utilisateur/`) puis relit tout : la personne suivante ne voit rien de la
 * précédente. En simulation, il n'y a pas de backend : on referme la session simulée sur place.
 */
export function BoutonDeconnexion({ libelle, className, action = 'deconnexion' }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const afficherToast = useToast();
  const enCours = useRef(false);

  const fermer = async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      if (SIMULATION) {
        await deconnecterSimulation();
        await client.invalidateQueries();
        return;
      }
      await (action === 'changer'
        ? connexionChangerUtilisateurCreate()
        : connexionDeconnexionCreate());
      await client.resetQueries();
    } catch {
      afficherToast(t('erreur.injoignable'));
    } finally {
      enCours.current = false;
    }
  };

  return (
    <button type="button" className={className} onClick={() => void fermer()}>
      {libelle ?? t('commun.deconnexion')}
    </button>
  );
}
