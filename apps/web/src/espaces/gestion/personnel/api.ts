import { ErreurApi, optiboulFetch } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  InstantanePaie,
  NouveauPaiement,
  NouvelAjustement,
  PaiementDesRestes,
  ReponsePaiement,
} from './types.ts';

// Le backend n'a pas encore ces routes : l'écran lit le faux serveur (`simulation/personnel.ts`).
const RACINE = '/api/v1/simulation/gestion/personnel/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const clePersonnel = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'personnel', utilisateur] as const;

export function usePersonnel(utilisateur: string | undefined) {
  return useQuery({
    queryKey: clePersonnel(utilisateur),
    queryFn: async () => (await optiboulFetch<Reponse<InstantanePaie>>(RACINE)).data,
    enabled: Boolean(utilisateur),
    // La validation se fait aussi depuis l'écran Demandes : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function envoyer<T>(chemin: string, methode: string, corps?: unknown): Promise<T> {
  return (
    await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
      method: methode,
      ...(corps === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
    })
  ).data;
}

/** Une action sur l'état de paie : l'écran prend l'instantané renvoyé. */
function useActionPaie<Demande, Resultat extends InstantanePaie | ReponsePaiement = InstantanePaie>(
  utilisateur: string | undefined,
  action: (demande: Demande) => Promise<Resultat>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (resultat) => {
      const instantane = 'instantane' in resultat ? resultat.instantane : resultat;
      client.setQueryData(clePersonnel(utilisateur), instantane);
      // Soumettre crée une demande, payer crée des dépenses « Salaires » (budget, semaine).
      void client.invalidateQueries({ queryKey: ['simulation', 'demandes'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'depenses'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'semaines'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'tableau-de-bord'] });
    },
  });
}

export const useAjouterLigne = (utilisateur: string | undefined) =>
  useActionPaie<NouvelAjustement>(utilisateur, (ligne) =>
    envoyer<InstantanePaie>('ajustements/', 'POST', ligne),
  );
export const useRetirerLigne = (utilisateur: string | undefined) =>
  useActionPaie<string>(utilisateur, (id) =>
    envoyer<InstantanePaie>(`ajustements/${encodeURIComponent(id)}/`, 'DELETE'),
  );
export const useChoisirLeJour = (utilisateur: string | undefined) =>
  useActionPaie<string>(utilisateur, (jour) => envoyer<InstantanePaie>('jour/', 'PUT', { jour }));
export const usePlanifierLeMois = (utilisateur: string | undefined) =>
  useActionPaie<{ mois: string; jour: string }>(utilisateur, (demande) =>
    envoyer<InstantanePaie>('calendrier/', 'PUT', demande),
  );
export const useSoumettre = (utilisateur: string | undefined) =>
  useActionPaie<void>(utilisateur, () => envoyer<InstantanePaie>('soumettre/', 'POST'));
export const usePayer = (utilisateur: string | undefined) =>
  useActionPaie<NouveauPaiement, ReponsePaiement>(utilisateur, (demande) =>
    envoyer<ReponsePaiement>('paiements/', 'POST', demande),
  );
export const usePayerLesRestes = (utilisateur: string | undefined) =>
  useActionPaie<PaiementDesRestes, ReponsePaiement>(utilisateur, (demande) =>
    envoyer<ReponsePaiement>('paiements/restes/', 'POST', demande),
  );

/** La validation ou le refus passe par l'écran Demandes : même route que lui. */
export function useDeciderLaPaie(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accord }: { id: string; accord: boolean }) =>
      (
        await optiboulFetch<Reponse<unknown>>(`/api/v1/simulation/demandes/${id}/decider/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accord }),
        })
      ).data,
    // Un refus du serveur (déjà décidée, droit) : on relit l'état et les demandes.
    onError: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clePersonnel(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'demandes'] }),
      ]),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clePersonnel(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'demandes'] }),
        client.invalidateQueries({ queryKey: ['simulation', 'notifications'] }),
      ]),
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
