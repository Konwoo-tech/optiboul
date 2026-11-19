import {
  ErreurApi,
  groupesCreate,
  optiboulFetch,
  utilisateursCodeCreate,
  utilisateursCreate,
  utilisateursDebloquerCreate,
  utilisateursGroupeCreate,
} from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { enErreurDeChamps, lireUtilisateursReels, telephoneDuServeur } from './reel.ts';
import type {
  ErreursUtilisateur,
  InstantaneUtilisateurs,
  NouveauGroupe,
  NouvelUtilisateur,
  ReponseCreation,
} from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/utilisateurs.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = SIMULATION ? '/api/v1/simulation/gestion/utilisateurs/' : '';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleUtilisateurs = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'utilisateurs', utilisateur] as const;

export function useUtilisateurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleUtilisateurs(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantaneUtilisateurs>>(RACINE)).data
        : lireUtilisateursReels(),
    enabled: Boolean(utilisateur),
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

const refus = (code: string) =>
  new ErreurApi(409, { code, detail: 'Action indisponible sur le serveur.' });

/** Une action sur les comptes : l'écran prend l'instantané renvoyé et relit ce qui en dépend. */
function useAction<
  Demande,
  Resultat extends InstantaneUtilisateurs | ReponseCreation = InstantaneUtilisateurs,
>(
  utilisateur: string | undefined,
  simulee: (demande: Demande) => Promise<Resultat>,
  /** La même action sur le vrai serveur ; l'instantané est relu ensuite. */
  surLeServeur: (demande: Demande) => Promise<Partial<ReponseCreation>>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<Resultat> => {
      if (SIMULATION) return simulee(demande);
      const retour = await surLeServeur(demande);
      const instantane = await lireUtilisateursReels();
      return (retour.utilisateur === undefined
        ? instantane
        : { ...retour, instantane }) as unknown as Resultat;
    },
    onSuccess: (resultat) => {
      client.setQueryData(
        cleUtilisateurs(utilisateur),
        'instantane' in resultat ? resultat.instantane : resultat,
      );
      // La liste de l'écran de connexion, les affectations de semaine et le contexte en dépendent.
      void client.invalidateQueries({ queryKey: ['simulation', 'utilisateurs'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'semaines'] });
    },
  });
}

export const useCreerUtilisateur = (utilisateur: string | undefined) =>
  useAction<NouvelUtilisateur, ReponseCreation>(
    utilisateur,
    (nouveau) => envoyer<ReponseCreation>('', 'POST', nouveau),
    async (nouveau) => {
      let creee;
      try {
        creee = (
          await utilisateursCreate({
            nom: nouveau.nom,
            email: nouveau.email,
            telephone: telephoneDuServeur(nouveau.telephone),
            groupe: Number(nouveau.groupe),
            canal: nouveau.canal,
          })
        ).data as unknown as { id: number; codesSecours?: string[] };
      } catch (erreur) {
        throw enErreurDeChamps(erreur);
      }
      // Le serveur ne rend ni le téléphone ni le canal : on garde ceux de la saisie pour l'écran de succès.
      return {
        utilisateur: {
          id: String(creee.id),
          nom: nouveau.nom,
          profil: 'caissier',
          email: nouveau.email,
          telephone: nouveau.telephone,
          groupe: nouveau.groupe,
          actif: true,
          dernierAcces: '',
          canal: nouveau.canal,
        },
        codesSecours: creee.codesSecours ?? [],
      };
    },
  );
export const useChangerDeGroupe = (utilisateur: string | undefined) =>
  useAction<{ id: string; groupe: string }>(
    utilisateur,
    (d) =>
      envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(d.id)}/groupe/`, 'PUT', {
        groupe: d.groupe,
      }),
    async (d) => {
      await utilisateursGroupeCreate(Number(d.id), { groupe: Number(d.groupe) });
      return {};
    },
  );
/** Simulation : réinitialise le code ; sur le vrai serveur, l'administrateur en définit un (4 chiffres). */
export const useReinitialiserLeCode = (utilisateur: string | undefined) =>
  useAction<{ id: string; code?: string }>(
    utilisateur,
    ({ id }) =>
      envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(id)}/reinitialiser-code/`, 'POST'),
    async ({ id, code }) => {
      await utilisateursCodeCreate(Number(id), { code: code ?? '' });
      return {};
    },
  );
/** Le serveur n'a pas de désactivation de compte (M2). */
export const useActiver = (utilisateur: string | undefined) =>
  useAction<{ id: string; actif: boolean }>(
    utilisateur,
    (d) =>
      envoyer<InstantaneUtilisateurs>(`${encodeURIComponent(d.id)}/activation/`, 'PUT', {
        actif: d.actif,
      }),
    () => Promise.reject(refus('indisponible')),
  );
/** Lève le blocage d'un compte après trop de codes faux (vrai serveur seulement). */
export const useDebloquer = (utilisateur: string | undefined) =>
  useAction<string>(
    utilisateur,
    () => Promise.reject(refus('indisponible')),
    async (id) => {
      await utilisateursDebloquerCreate(Number(id));
      return {};
    },
  );

export const useCreerUnGroupe = (utilisateur: string | undefined) =>
  useAction<NouveauGroupe>(
    utilisateur,
    (g) => envoyer<InstantaneUtilisateurs>('groupes/', 'POST', g),
    async (g) => {
      try {
        await groupesCreate({ nom: g.nom, profil: g.profil, description: g.description });
      } catch (erreur) {
        throw enErreurDeGroupe(erreur);
      }
      return {};
    },
  );

/** Un refus de validation du serveur sur un groupe devient le code que l'écran sait lire. */
function enErreurDeGroupe(erreur: unknown): unknown {
  if (!(erreur instanceof ErreurApi) || erreur.status !== 400 || erreur.code) return erreur;
  const messages = (erreur.details as { nom?: unknown[] } | undefined)?.nom;
  const message = String(messages?.[0] ?? '');
  const code = /déjà/.test(message)
    ? 'groupe_existant'
    : /vide/.test(message)
      ? 'nom_obligatoire'
      : message
        ? 'nom_trop_long'
        : undefined;
  return code ? new ErreurApi(409, { code, detail: message }) : erreur;
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

/** Erreurs par champ d'un refus `champs_invalides`. */
export function erreursDeChamps(erreur: unknown): ErreursUtilisateur {
  if (!(erreur instanceof ErreurApi) || erreur.code !== 'champs_invalides') return {};
  return (erreur.details as { erreurs?: ErreursUtilisateur } | undefined)?.erreurs ?? {};
}
