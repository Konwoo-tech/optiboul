import {
  serviceConnexionReel,
  usePersonnesDuPoste,
  type Identification,
} from '@/auth/connexion.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { ChoixUtilisateur } from './ChoixUtilisateur.tsx';
import { FormulaireEmail } from './FormulaireEmail.tsx';
import { VerificationDeuxEtapes, type EnAttente } from './VerificationDeuxEtapes.tsx';

type Props = {
  /** Message à afficher au-dessus du formulaire (vide : l'efface). */
  onMessage: (message: string) => void;
};

/**
 * Parcours de connexion sur le vrai serveur : identification, puis vérification en deux étapes.
 * Sur un poste de confiance (O1), on touche son nom puis on saisit son code à 4 chiffres ; ailleurs,
 * ou avec `?mode=email` (l'administrateur y amorce un poste), on se connecte par adresse e-mail et
 * mot de passe. La connexion par Google n'est pas proposée tant que le jeton Google Identity
 * Services n'est pas configuré.
 * Rend un fragment : les blocs sont les enfants directs de la colonne de droite.
 */
export default function EcransReels({ onMessage }: Props) {
  const client = useQueryClient();
  const [parametres] = useSearchParams();
  const { personnes, chargement, posteNonReconnu } = usePersonnesDuPoste();
  const [attente, setAttente] = useState<EnAttente | null>(null);

  /** Première étape. Une erreur (code ou mot de passe faux) remonte à l'écran qui l'a demandée. */
  const identifierEtSuivre = async (identification: Identification) => {
    const reponse = await serviceConnexionReel.identifier(identification);
    onMessage('');
    if (reponse.deuxFacteurs) {
      setAttente(reponse);
    } else {
      await client.invalidateQueries();
    }
  };

  if (attente) {
    return (
      <VerificationDeuxEtapes
        attente={attente}
        envoyerCode={serviceConnexionReel.envoyerCode}
        verifierCode={serviceConnexionReel.verifierCode}
        onRetour={() => {
          void serviceConnexionReel.annuler();
          setAttente(null);
        }}
        onTermine={() => void client.invalidateQueries()}
      />
    );
  }
  if (chargement) return null;
  const parEmail = parametres.get('mode') === 'email' || posteNonReconnu || !personnes;
  if (!parEmail && personnes) {
    return (
      <ChoixUtilisateur
        utilisateurs={personnes}
        identifier={identifierEtSuivre}
        onChoisi={() => onMessage('')}
      />
    );
  }
  return <FormulaireEmail identifier={identifierEtSuivre} />;
}
