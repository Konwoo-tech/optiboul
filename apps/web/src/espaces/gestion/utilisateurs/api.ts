import {
  ErreurApi,
  groupesCreate,
  groupesDestroy,
  groupesPartialUpdate,
  utilisateursActivationCreate,
  utilisateursCreate,
  utilisateursDebloquerCreate,
  utilisateursGroupeCreate,
  utilisateursPartialUpdate,
  utilisateursReinitialiserCodeCreate,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { enErreurDeChamps, lireUtilisateursReels, telephoneDuServeur } from './reel.ts';
import type {
  Canal,
  ErreursUtilisateur,
  InstantaneUtilisateurs,
  NouveauGroupe,
  NouvelUtilisateur,
  ReponseCreation,
} from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleUtilisateurs = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'utilisateurs', utilisateur] as const;

export function useUtilisateurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleUtilisateurs(utilisateur),
    queryFn: lireUtilisateursReels,
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action sur les comptes : l'écran prend l'instantané renvoyé et relit ce qui en dépend. */
function useAction<
  Demande,
  Resultat extends InstantaneUtilisateurs | ReponseCreation = InstantaneUtilisateurs,
>(
  utilisateur: string | undefined,
  /** L'action sur le serveur ; l'instantané est relu ensuite. */
  surLeServeur: (demande: Demande) => Promise<Partial<ReponseCreation>>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<Resultat> => {
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
      void client.invalidateQueries({ queryKey: ['ecran', 'utilisateurs'] });
      void client.invalidateQueries({ queryKey: ['ecran', 'contexte'] });
      void client.invalidateQueries({ queryKey: ['ecran', 'gestion', 'semaines'] });
    },
  });
}

export const useCreerUtilisateur = (utilisateur: string | undefined) =>
  useAction<NouvelUtilisateur, ReponseCreation>(utilisateur, async (nouveau) => {
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
  });
export const useChangerDeGroupe = (utilisateur: string | undefined) =>
  useAction<{ id: string; groupe: string }>(utilisateur, async (d) => {
    await utilisateursGroupeCreate(Number(d.id), { groupe: Number(d.groupe) });
    return {};
  });
/** Réinitialise le code : le serveur en génère un (4 chiffres) et l'envoie à la personne par son canal. */
export const useReinitialiserLeCode = (utilisateur: string | undefined) =>
  useAction<{ id: string }>(utilisateur, async ({ id }) => {
    await utilisateursReinitialiserCodeCreate(Number(id));
    return {};
  });
/** Désactive ou réactive un compte (refus : `compte_propre`, `dernier_administrateur`). */
export const useActiver = (utilisateur: string | undefined) =>
  useAction<{ id: string; actif: boolean }>(utilisateur, async ({ id, actif }) => {
    await utilisateursActivationCreate(Number(id), { actif });
    return {};
  });
/** Corrige le nom, le téléphone et le canal d'un compte (`PATCH /utilisateurs/{id}/`). */
export const useModifierUnUtilisateur = (utilisateur: string | undefined) =>
  useAction<{ id: string; nom: string; telephone: string; canal: Canal }>(
    utilisateur,
    async ({ id, nom, telephone, canal }) => {
      try {
        await utilisateursPartialUpdate(Number(id), {
          nom,
          telephone: telephoneDuServeur(telephone),
          canal,
        });
      } catch (erreur) {
        throw enErreurDeChamps(erreur);
      }
      return {};
    },
  );
/** Lève le blocage d'un compte après trop de codes faux. */
export const useDebloquer = (utilisateur: string | undefined) =>
  useAction<string>(utilisateur, async (id) => {
    await utilisateursDebloquerCreate(Number(id));
    return {};
  });

export const useCreerUnGroupe = (utilisateur: string | undefined) =>
  useAction<NouveauGroupe>(utilisateur, async (g) => {
    try {
      await groupesCreate({ nom: g.nom, profil: g.profil, description: g.description });
    } catch (erreur) {
      throw enErreurDeGroupe(erreur);
    }
    return {};
  });

export const useModifierUnGroupe = (utilisateur: string | undefined) =>
  useAction<{ id: string; groupe: NouveauGroupe }>(utilisateur, async ({ id, groupe }) => {
    try {
      await groupesPartialUpdate(Number(id), {
        nom: groupe.nom,
        profil: groupe.profil,
        description: groupe.description,
      });
    } catch (erreur) {
      throw enErreurDeGroupe(erreur);
    }
    return {};
  });

/** Supprime un groupe vide ; le serveur refuse un groupe protégé ou qui a encore des membres. */
export const useSupprimerUnGroupe = (utilisateur: string | undefined) =>
  useAction<string>(utilisateur, async (id) => {
    await groupesDestroy(Number(id));
    return {};
  });

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
