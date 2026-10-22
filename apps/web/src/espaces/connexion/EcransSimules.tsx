import { useTranslation } from '@/i18n';
import {
  annulerIdentification,
  configurationSimulee,
  identifier,
  type Identification,
} from '@/simulation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ChoixCompteGoogle } from './ChoixCompteGoogle.tsx';
import { ChoixUtilisateur } from './ChoixUtilisateur.tsx';
import { FormulaireEmail } from './FormulaireEmail.tsx';
import { VerificationDeuxEtapes, type EnAttente } from './VerificationDeuxEtapes.tsx';

type Props = {
  /** Message à afficher au-dessus du formulaire (vide : l'efface). */
  onMessage: (message: string) => void;
};

/**
 * Parcours de connexion de la maquette, joué sur de fausses données (mode simulation) :
 * identification (Google, e-mail ou nom + code), puis vérification en deux étapes.
 * Ce module n'est chargé que dans le mode simulation (voir Connexion.tsx) : il cite les codes
 * et mots de passe de démonstration, qui ne doivent pas se retrouver dans le paquet de production.
 * Rend un fragment : les blocs sont les enfants directs de la colonne de droite.
 */
export default function EcransSimules({ onMessage }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const configuration = configurationSimulee();
  const [googleOuvert, setGoogleOuvert] = useState(false);
  const [attente, setAttente] = useState<EnAttente | null>(null);

  /** Première étape. Une erreur (code ou mot de passe faux) remonte à l'écran qui l'a demandée. */
  const identifierEtSuivre = async (identification: Identification) => {
    const reponse = await identifier(identification, configuration.deuxFacteurs);
    onMessage('');
    if (reponse.deuxFacteurs) {
      setGoogleOuvert(false);
      setAttente(reponse);
    } else {
      await client.invalidateQueries();
    }
  };

  if (attente) {
    return (
      <VerificationDeuxEtapes
        attente={attente}
        onRetour={() => {
          void annulerIdentification();
          setAttente(null);
        }}
        onTermine={() => void client.invalidateQueries()}
      />
    );
  }
  if (configuration.mode === 'code') {
    return <ChoixUtilisateur identifier={identifierEtSuivre} onChoisi={() => onMessage('')} />;
  }
  if (googleOuvert) {
    return (
      <ChoixCompteGoogle
        onChoisir={(email) =>
          void identifierEtSuivre({ methode: 'google', email }).catch(() =>
            onMessage(t('connexion.googleRefuse')),
          )
        }
        onAnnuler={() => setGoogleOuvert(false)}
      />
    );
  }
  return (
    <FormulaireEmail
      identifier={identifierEtSuivre}
      onGoogle={() => {
        onMessage('');
        setGoogleOuvert(true);
      }}
    />
  );
}
