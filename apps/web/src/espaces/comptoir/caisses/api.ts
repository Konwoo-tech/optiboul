import {
  caissesEspecesRetrieve,
  caissesList,
  caissesProchaineRetrieve,
  caissesRecapitulatifList,
  optiboulFetch,
  toutesLesPages,
  type Caisse,
  type Recapitulatif,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PLAFOND_CAISSE } from './regles.ts';
import type {
  DetailEspeces,
  FermetureDemandee,
  OuvertureDemandee,
  ReouvertureDemandee,
  RemiseDemandee,
  RemiseEnregistree,
  ReponseCaisses,
  SessionCaisse,
} from './types.ts';

/**
 * Ouvrir, fermer, rouvrir et remettre au coffre : branchés aux étapes « caisses : actions » (#271).
 * D'ici là, ces boutons ne sont proposés qu'en simulation.
 */
export const ACTIONS_DE_CAISSE_DISPONIBLES = SIMULATION;

// En simulation, l'écran lit l'API simulée ; sur le vrai serveur, `lireCaisses` compose les routes.
const RACINE = '/api/v1/simulation/caisses/';
const JSON_ENTETES = { 'Content-Type': 'application/json' };

type Reponse<T> = { data: T };

const poster = <T = undefined>(chemin: string, corps: object) =>
  optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
    method: 'POST',
    headers: JSON_ENTETES,
    body: JSON.stringify(corps),
  });

/** Clé des caisses : elle contient la personne connectée, pour ne jamais montrer celles d'une autre. */
export const cleCaisses = (utilisateur: string | undefined) =>
  ['comptoir', 'caisses', utilisateur] as const;

const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  }).format(new Date(iso));

/** Une caisse du vrai serveur, telle que le tableau la lit. */
export function versSessionDeCaisse(caisse: Caisse, especes: DetailEspeces | null): SessionCaisse {
  const caissiere = { id: String(caisse.caissiere.id), nom: caisse.caissiere.nom };
  return {
    id: String(caisse.id),
    jour: caisse.jour,
    type: caisse.creneau === 'jour' ? 'jour' : 'nuit',
    caissiere,
    ouverture: { heure: heureDeYaounde(caisse.ouverte_le), par: caissiere.nom },
    // Le serveur ne dit pas qui a fermé : on affiche la caissière de la caisse.
    fermeture: caisse.fermee_le
      ? { heure: heureDeYaounde(caisse.fermee_le), par: caissiere.nom }
      : null,
    fonds: caisse.fonds,
    attendu: caisse.attendu ?? especes?.attendu ?? caisse.fonds,
    compte: caisse.compte,
    // La recette n'existe que par caissière : voir `recapitulatif`.
    recette: 0,
    enCours: caisse.en_cours,
  };
}

/**
 * Compose `GET /caisses/` (toutes les pages), `recapitulatif`, `prochaine` et `{id}/especes` en la
 * réponse de l'écran. Le serveur ne donne pas la liste des caissières ni les personnes qui reçoivent
 * une remise : les caissières viennent des caisses, les receveurs seront branchés avec la remise (#271).
 */
export async function lireCaisses(moi: string): Promise<ReponseCaisses> {
  const [caisses, recapitulatif, prochaine] = await Promise.all([
    toutesLesPages<Caisse>(
      (page) =>
        caissesList({ page }) as Promise<{ data: { results?: Caisse[]; next?: string | null } }>,
    ),
    caissesRecapitulatifList()
      .then((r) => r.data as Recapitulatif[])
      .catch(() => [] as Recapitulatif[]),
    caissesProchaineRetrieve(),
  ]);
  const ouverte = caisses.find((c) => c.en_cours);
  // Le détail des espèces n'est donné qu'aux personnes qui peuvent voir la caisse ouverte.
  const especes = ouverte
    ? await caissesEspecesRetrieve(ouverte.id)
        .then((r) => r.data as DetailEspeces & { plafond: number })
        .catch(() => null)
    : null;
  const detail: DetailEspeces | null = especes
    ? {
        fonds: especes.fonds,
        especes: especes.especes,
        depenses: especes.depenses,
        remises: especes.remises,
        attendu: especes.attendu,
      }
    : null;
  // Les plus anciennes d'abord, la caisse ouverte à la fin.
  const sessions = caisses
    .toSorted((a, b) => a.ouverte_le.localeCompare(b.ouverte_le))
    .map((c) => versSessionDeCaisse(c, c.en_cours ? detail : null));
  const triees = [...sessions.filter((s) => !s.enCours), ...sessions.filter((s) => s.enCours)];
  const personnes = new Map<string, { id: string; nom: string }>();
  for (const { caissiere } of recapitulatif) {
    personnes.set(String(caissiere.id), { id: String(caissiere.id), nom: caissiere.nom });
  }
  for (const s of triees) personnes.set(s.caissiere.id, s.caissiere);
  const derniere = triees.at(-1);
  const planifiee = prochaine.data.planifiee;
  return {
    moi,
    caissieres: [...personnes.values()],
    sessions: triees,
    caisseOuverte: ouverte
      ? (() => {
          const s = triees.find((x) => x.id === String(ouverte.id)) as SessionCaisse;
          return { jour: s.jour, type: s.type, caissiere: s.caissiere, ouverture: s.ouverture };
        })()
      : null,
    detail,
    prochaine: {
      type: prochaine.data.creneau === 'jour' ? 'jour' : 'nuit',
      jour: prochaine.data.jour,
      planifiee: planifiee ? { id: String(planifiee.id), nom: planifiee.nom } : null,
    },
    rouvrable: Boolean(derniere && !derniere.enCours),
    plafond: especes?.plafond ?? PLAFOND_CAISSE,
    receveurs: [],
    recapitulatif: Object.fromEntries(
      recapitulatif.map((r) => [
        String(r.caissiere.id),
        { ouvertures: r.ouvertures, recette: r.recette, ecart: r.ecart_cumule },
      ]),
    ),
  };
}

/** Identifiant de la personne connectée : le dernier segment de son adresse `/users/4/`. */
const idDeLUtilisateur = (url: string | undefined) => url?.split('/').filter(Boolean).at(-1) ?? '';

/** Caisses visibles par la personne connectée (la caissière ne reçoit que les siennes). */
export function useCaisses(utilisateur: string | undefined) {
  const { utilisateur: connecte } = useUtilisateurCourant();
  return useQuery({
    queryKey: cleCaisses(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<ReponseCaisses>>(RACINE)).data
        : lireCaisses(idDeLUtilisateur(connecte?.url)),
    enabled: Boolean(utilisateur) && (SIMULATION || Boolean(connecte)),
    // Les espèces bougent à chaque livraison et chaque dépense : on relit à chaque ouverture de l'écran.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action sur les caisses, puis rechargement de la liste. */
function useActionCaisse<Demande extends object, Resultat = undefined>(
  utilisateur: string | undefined,
  chemin: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande) => (await poster<Resultat>(chemin, demande)).data,
    // La pastille « Session … » de l'en-tête dérive du contexte : on le relit aussi.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cleCaisses(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'contexte'] }),
      ]),
  });
}

export const useOuvrirCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<OuvertureDemandee>(utilisateur, 'ouvrir/');

export const useFermerCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<FermetureDemandee>(utilisateur, 'fermer/');

export const useRouvrirCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<ReouvertureDemandee>(utilisateur, 'rouvrir/');

export const useRemettreAuCoffre = (utilisateur: string | undefined) =>
  useActionCaisse<RemiseDemandee, RemiseEnregistree>(utilisateur, 'remettre/');
