import {
  identifierParGoogle,
  serviceConnexionReel,
  usePersonnesDuPoste,
  type Identification,
  type ReponseIdentification,
} from '@/auth/connexion.ts';
import { connexionMotDePasseOublieCreate, useConnexionGoogleConfigurationRetrieve } from '@/api';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { BoutonGoogle } from './BoutonGoogle.tsx';
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
 * mot de passe, ou par Google quand le serveur a un identifiant OAuth (#306).
 * Rend un fragment : les blocs sont les enfants directs de la colonne de droite.
 */
export default function EcransReels({ onMessage }: Props) {
  const client = useQueryClient();
  const [parametres] = useSearchParams();
  const { personnes, chargement, posteNonReconnu } = usePersonnesDuPoste();
  const [attente, setAttente] = useState<EnAttente | null>(null);
  const google = useConnexionGoogleConfigurationRetrieve({
    query: { retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  }).data?.data;

  const suivre = async (reponse: ReponseIdentification) => {
    onMessage('');
    if (reponse.deuxFacteurs) {
      setAttente(reponse);
    } else {
      await client.invalidateQueries();
    }
  };

  /** Première étape. Une erreur (code ou mot de passe faux) remonte à l'écran qui l'a demandée. */
  const identifierEtSuivre = async (identification: Identification) =>
    suivre(await serviceConnexionReel.identifier(identification));

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
  return (
    <FormulaireEmail
      identifier={identifierEtSuivre}
      boutonGoogle={
        google && (google.client_id || google.jetons_de_test) ? (
          <BoutonGoogle
            clientId={google.client_id}
            testLocal={google.jetons_de_test}
            onJeton={async (jeton) => suivre(await identifierParGoogle(jeton))}
          />
        ) : undefined
      }
      onOublie={async (email) => {
        await connexionMotDePasseOublieCreate({ email });
      }}
    />
  );
}
