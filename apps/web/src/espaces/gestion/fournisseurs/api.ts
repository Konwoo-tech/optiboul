import {
  ErreurApi,
  manquantsRelancerCreate,
  manquantsReplanifierCreate,
  optiboulFetch,
  receptionsPlanifieesCreate,
  receptionsPlanifieesReceptionnerCreate,
} from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lireFournisseursReels, numeroDeCommande } from './reel.ts';
import type {
  Commande,
  Facture,
  InstantaneFournisseurs,
  NouveauPaiement,
  NouvelleCommande,
  NouvelleReception,
} from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/fournisseursApi.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = '/api/v1/simulation/gestion/fournisseurs/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleFournisseurs = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'fournisseurs', utilisateur] as const;

export function useFournisseurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleFournisseurs(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantaneFournisseurs>>(RACINE)).data
        : lireFournisseursReels(),
    enabled: Boolean(utilisateur),
    // Le stock, les semaines et les dépenses bougent ailleurs : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

type Resultat = {
  instantane: InstantaneFournisseurs;
  commande?: Commande;
  reliquat?: Commande;
  facture?: Facture;
  depense?: string;
};

async function publier(chemin: string, corps: unknown): Promise<Resultat> {
  return (
    await optiboulFetch<Reponse<Resultat>>(`${RACINE}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
  ).data;
}

type Contexte = {
  /** L'instantané lu avant l'action : identifiants du serveur des bons et des manquants. */
  avant: InstantaneFournisseurs | undefined;
};

const introuvable = (code: string) =>
  new ErreurApi(409, { code, detail: 'La ligne a changé : la liste est relue.' });

/** Une action sur les fournisseurs : l'écran prend l'instantané renvoyé. */
function useAction<Demande>(
  utilisateur: string | undefined,
  chemin: string,
  /** La même action sur le vrai serveur ; elle rend ce que l'écran affiche en retour. */
  surLeServeur: (demande: Demande, contexte: Contexte) => Promise<Partial<Resultat>>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<Resultat> => {
      if (SIMULATION) return publier(chemin, demande);
      const avant = client.getQueryData<InstantaneFournisseurs>(cleFournisseurs(utilisateur));
      const retour = await surLeServeur(demande, { avant });
      return { ...retour, instantane: await lireFournisseursReels() };
    },
    onSuccess: (reponse) => {
      client.setQueryData(cleFournisseurs(utilisateur), reponse.instantane);
    },
    // Un 404 ou un 409 veut dire que la liste était périmée : on la relit.
    onError: () => void client.invalidateQueries({ queryKey: cleFournisseurs(utilisateur) }),
  });
}

const commandeDe = ({ avant }: Contexte, numero: string) => {
  const commande = avant?.commandes.find((c) => c.numero === numero);
  if (commande?.idServeur === undefined) throw introuvable('commande_inconnue');
  return commande as Commande & { idServeur: number };
};

/** Le serveur reçoit les quantités en texte décimal. */
const decimal = (valeur: number) => String(valeur);

export const usePlanifier = (u: string | undefined) =>
  useAction<NouvelleCommande>(u, 'commandes/', async (saisie) => {
    const reponse = await receptionsPlanifieesCreate({
      fournisseur: Number(saisie.fournisseur),
      matiere: saisie.matiere,
      quantite: decimal(saisie.quantite),
      prevue_le: saisie.jour,
    });
    return {
      commande: { numero: numeroDeCommande((reponse.data as { id: number }).id) } as Commande,
    };
  });

export const useReceptionner = (u: string | undefined) =>
  useAction<NouvelleReception>(u, 'receptions/', async (saisie, contexte) => {
    const commande = commandeDe(contexte, saisie.commande);
    const reponse = await receptionsPlanifieesReceptionnerCreate(commande.idServeur, {
      quantite: decimal(saisie.quantite),
      ...(saisie.observation ? { observation: saisie.observation } : {}),
    });
    const ecart = Number((reponse.data as { ecart?: string }).ecart ?? 0);
    return { commande: { statut: ecart < 0 ? 'partielle' : 'recue' } as Commande };
  });

export const useRelancer = (u: string | undefined) =>
  useAction<{ commande: string }>(u, 'relances/', async ({ commande }, contexte) => {
    const { manquant } = commandeDe(contexte, commande);
    if (manquant === undefined) throw introuvable('aucun_manquant');
    await manquantsRelancerCreate(manquant);
    return {};
  });

export const useReplanifier = (u: string | undefined) =>
  useAction<{ commande: string }>(u, 'reliquats/', async ({ commande }, contexte) => {
    const { manquant } = commandeDe(contexte, commande);
    if (manquant === undefined) throw introuvable('aucun_manquant');
    // Le serveur demande le jour : demain, comme la proposition de l'écran.
    const jour = contexte.avant?.jours[1] ?? contexte.avant?.jours[0] ?? '';
    await manquantsReplanifierCreate(manquant, { prevue_le: jour });
    return { reliquat: { jour } as Commande };
  });

// Le paiement des factures est branché par le ticket suivant (#286).
export const usePayer = (u: string | undefined) =>
  useAction<NouveauPaiement>(u, 'paiements/', () => Promise.reject(introuvable('indisponible')));

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
