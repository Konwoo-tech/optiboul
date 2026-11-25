import { budgetsFixerUpdate, depensesCreate, ErreurApi, preAutorisationsFixerUpdate } from '@/api';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { lireDepensesReelles, versCodeCategorie } from './reel.ts';
import { ACHATS_COURANTS, type AchatCourant, type Categorie } from './types.ts';
import type { DemandeDepense, Depense, InstantaneDepenses, NouvelleDepense } from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleDepenses = (utilisateur: string | undefined) =>
  ['simulation', 'comptoir', 'depenses', utilisateur] as const;

export function useDepenses(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleDepenses(utilisateur),
    queryFn: lireDepensesReelles,
    enabled: Boolean(utilisateur),
    // Les dépenses bougent depuis d'autres écrans (demandes) : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export type DepenseEnregistree = {
  instantane: InstantaneDepenses;
  depense: Depense;
  demande?: DemandeDepense;
};

/**
 * `POST /depenses/` (multipart, avec le justificatif) puis relecture : le serveur numérote (DEP-xxxx),
 * rattache à la session ou à la semaine, et émet une demande au-dessus du seuil.
 */
export async function enregistrerSurLeServeur(
  client: QueryClient,
  utilisateur: string | undefined,
  depense: NouvelleDepense,
): Promise<DepenseEnregistree> {
  const avant = client.getQueryData<InstantaneDepenses>(cleDepenses(utilisateur));
  // L'écran choisit un fournisseur par identifiant, le serveur attend son nom.
  const nomDuFournisseur = avant?.fournisseurs.find((f) => f.id === depense.fournisseur)?.nom;
  const reponse = await depensesCreate(
    {
      categorie: versCodeCategorie(depense.categorie) as never,
      libelle: depense.libelle,
      montant: depense.montant,
      paye_par: depense.mode as never,
      rattachement: depense.rattachement,
      ...(depense.rattachement === 'stock'
        ? {
            // Bois, levure… : l'achat entre dans la pré-autorisation de la semaine (O7).
            ...((ACHATS_COURANTS as readonly string[]).includes(depense.matiere ?? '')
              ? { achat_courant: depense.matiere as never }
              : {}),
            matiere: depense.matiere,
            quantite: depense.quantite === undefined ? undefined : String(depense.quantite),
            // Sans fournisseur, le serveur veut « Marché » : un achat au marché.
            fournisseur: nomDuFournisseur ?? 'Marché',
          }
        : {}),
      ...(depense.justificatif ? { justificatif: depense.justificatif as never } : {}),
    },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
  const enregistree = reponse.data as { id: number; demande?: string | null };
  const instantane = await lireDepensesReelles();
  const creee = instantane.depenses.find((d) => d.id === String(enregistree.id));
  if (!creee) throw new Error('Dépense introuvable après enregistrement');
  const demande = enregistree.demande
    ? instantane.demandes.find((d) => d.depenseId === creee.id)
    : undefined;
  return { instantane, depense: creee, ...(demande ? { demande } : {}) };
}

/** Fixe le budget du mois par catégorie (le propriétaire) : `PUT /budgets/fixer/`, puis relecture. */
export function useFixerBudget(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ mois, montants }: { mois: string; montants: Record<Categorie, number> }) =>
      budgetsFixerUpdate({
        mois,
        montants: Object.fromEntries(
          Object.entries(montants).map(([categorie, montant]) => [
            versCodeCategorie(categorie as Categorie),
            montant,
          ]),
        ),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: cleDepenses(utilisateur) }),
  });
}

/** Fixe le plafond de chaque achat courant de la semaine (gérant, propriétaire) ; 0 le retire. */
export function useFixerPreAutorisations(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (plafonds: Record<AchatCourant, number>) =>
      preAutorisationsFixerUpdate({ plafonds }),
    onSuccess: () => client.invalidateQueries({ queryKey: cleDepenses(utilisateur) }),
  });
}

export function useEnregistrerDepense(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (depense: NouvelleDepense): Promise<DepenseEnregistree> =>
      enregistrerSurLeServeur(client, utilisateur, depense),
    onSuccess: (reponse) => {
      client.setQueryData(cleDepenses(utilisateur), reponse.instantane);
      // Une dépense payée en caisse change les espèces attendues de la caisse et de la clôture.
      void client.invalidateQueries({ queryKey: ['comptoir', 'caisses'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'session'] });
    },
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
