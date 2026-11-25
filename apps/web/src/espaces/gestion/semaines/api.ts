import {
  ErreurApi,
  getSemainesPassationRetrieveUrl,
  semainesAffectationsCreate,
  semainesCopierPrecedenteCreate,
  semainesCreate,
  semainesRotationRetrieve,
  semainesCloturerCreate,
  semainesCloturerForceeCreate,
  semainesOuvrirCreate,
  semainesPlanningUpdate,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireSemainesReelles } from './reel.ts';
import type { InstantaneSemaines, NouveauCreneau, NouvelleAffectation } from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleSemaines = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'semaines', utilisateur] as const;

export function useSemaines(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleSemaines(utilisateur),
    queryFn: lireSemainesReelles,
    enabled: Boolean(utilisateur),
    // Les caisses, les dépenses et les demandes bougent ailleurs : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action sur les semaines : l'écran prend l'instantané renvoyé, la coque relit son contexte. */
function useActionSemaines<Demande>(
  utilisateur: string | undefined,
  /** L'action sur le serveur ; elle reçoit la semaine visée (identifiant du serveur). */
  surLeServeur: (demande: Demande, idsDesSemaines: Record<string, number>) => Promise<unknown>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<InstantaneSemaines> => {
      const lues = client.getQueryData<InstantaneSemaines>(cleSemaines(utilisateur));
      const ids = Object.fromEntries(
        (lues?.semaines ?? []).flatMap((s) => (s.idServeur ? [[s.id, s.idServeur] as const] : [])),
      );
      await surLeServeur(demande, ids);
      return lireSemainesReelles();
    },
    onSuccess: (instantane) => {
      client.setQueryData(cleSemaines(utilisateur), instantane);
      // L'ouverture et la clôture changent la semaine, le gérant et le responsable de l'en-tête,
      // et la caissière prévue sur le prochain créneau de la caisse.
      void client.invalidateQueries({ queryKey: ['ecran', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['coque', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] });
    },
  });
}

const idDe = (ids: Record<string, number>, semaine: string) => {
  const id = ids[semaine];
  if (id === undefined) {
    throw new ErreurApi(409, { code: 'semaine_inconnue', detail: 'Semaine introuvable' });
  }
  return id;
};

/** Affecte le gérant ou le responsable de production : le serveur reçoit les deux, l'autre inchangé. */
export const useAffecter = (utilisateur: string | undefined) => {
  const client = useQueryClient();
  return useActionSemaines<NouvelleAffectation>(
    utilisateur,
    async ({ semaine, role, personne }, ids) => {
      const lues = client.getQueryData<InstantaneSemaines>(cleSemaines(utilisateur));
      const actuelle = lues?.semaines.find((s) => s.id === semaine);
      const valeur = (id: string | undefined) => (id ? Number(id) : null);
      await semainesAffectationsCreate(idDe(ids, semaine), {
        gerant: role === 'gerant' ? valeur(personne) : valeur(actuelle?.gerant?.id),
        production: role === 'production' ? valeur(personne) : valeur(actuelle?.production?.id),
      });
    },
  );
};
/** Place une caissière sur un créneau du planning (vide : le créneau n'a plus personne). */
export const usePlanifier = (utilisateur: string | undefined) =>
  useActionSemaines<NouveauCreneau>(
    utilisateur,
    async ({ semaine, jour, creneau, caissiere }, ids) => {
      await semainesPlanningUpdate(idDe(ids, semaine), {
        jour,
        creneau,
        caissiere: caissiere ? Number(caissiere) : null,
      });
    },
  );
export const useOuvrirSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string }>(utilisateur, async ({ semaine }, ids) => {
    await semainesOuvrirCreate(idDe(ids, semaine));
  });
export const useCloturerSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string }>(utilisateur, async ({ semaine }, ids) => {
    await semainesCloturerCreate(idDe(ids, semaine));
  });

/** Le propriétaire force la clôture malgré des contrôles bloquants, avec un motif (US-035, O8). */
export const useCloturerDeForce = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string; motif: string }>(
    utilisateur,
    async ({ semaine, motif }, ids) => {
      await semainesCloturerForceeCreate(idDe(ids, semaine), { motif });
    },
  );

/** Ouvre le rapport de passation (PDF) d'une semaine clôturée dans un nouvel onglet. */
export function ouvrirLaPassation(idServeur: number) {
  window.open(getSemainesPassationRetrieveUrl(idServeur), '_blank', 'noopener');
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

/** Planifie une semaine (propriétaire) : `POST /semaines/`, équipe facultative. */
export const usePlanifierSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ annee: number; numero: number; gerant: string; production: string }>(
    utilisateur,
    async ({ annee, numero, gerant, production }) => {
      await semainesCreate({
        annee,
        numero,
        gerant: gerant ? Number(gerant) : null,
        production: production ? Number(production) : null,
      });
    },
  );

/** Reprend l'équipe et le planning des caisses de la semaine précédente (propriétaire). */
export const useCopierSemaine = (utilisateur: string | undefined) =>
  useActionSemaines<{ semaine: string }>(utilisateur, async ({ semaine }, ids) => {
    await semainesCopierPrecedenteCreate(idDe(ids, semaine));
  });

/** Le gérant et le responsable de production que la rotation propose pour une semaine. */
export async function lireRotation(annee: number, numero: number) {
  const { data } = await semainesRotationRetrieve({ annee, numero });
  return data as { gerant: number | null; production: number | null };
}
