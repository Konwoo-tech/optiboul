import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';

import { getUsersMeRetrieveQueryKey } from './generated/endpoints/users/users.ts';
import { estSansSession, reessayer } from './http.ts';

/**
 * Client de requêtes de l'application. Un 401/403 sur n'importe quel appel fait revérifier la
 * session : si elle a expiré, les gardes renvoient à la connexion sans recharger la page.
 */
export function creerClientRequetes(requetes: DefaultOptions['queries'] = {}): QueryClient {
  const cleSession = getUsersMeRetrieveQueryKey();
  const verifierSession = (erreur: unknown) => {
    if (estSansSession(erreur)) void client.invalidateQueries({ queryKey: cleSession });
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (erreur, requete) => {
        // La requête de session elle-même est déjà lue par les gardes.
        if (requete.queryKey[0] !== cleSession[0]) verifierSession(erreur);
      },
    }),
    mutationCache: new MutationCache({ onError: verifierSession }),
    // Pas de mutation optimiste sur les écrans d'argent (spécification technique §9.2).
    defaultOptions: { queries: { staleTime: 30_000, retry: reessayer, ...requetes } },
  });
  return client;
}
