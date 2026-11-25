import {
  ErreurApi,
  facturesPayerCreate,
  fournisseursCreate,
  fournisseursPartialUpdate,
  getPaiementsFournisseursRecuRetrieveUrl,
  manquantsRelancerCreate,
  manquantsReplanifierCreate,
  receptionsPlanifieesAnnulerCreate,
  receptionsPlanifieesCreate,
  receptionsPlanifieesReceptionnerCreate,
} from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SaisieFournisseur } from './ModaleFournisseur.tsx';
import { lireFournisseursReels, numeroDeCommande } from './reel.ts';
import {
  CODE_DES_CONDITIONS,
  type Commande,
  type Facture,
  type InstantaneFournisseurs,
  type NouveauPaiement,
  type NouvelleCommande,
  type NouvelleReception,
} from './types.ts';

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const cleFournisseurs = (utilisateur: string | undefined) =>
  ['ecran', 'gestion', 'fournisseurs', utilisateur] as const;

export function useFournisseurs(utilisateur: string | undefined) {
  return useQuery({
    queryKey: cleFournisseurs(utilisateur),
    queryFn: lireFournisseursReels,
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

type Contexte = {
  /** L'instantané lu avant l'action : identifiants du serveur des bons et des manquants. */
  avant: InstantaneFournisseurs | undefined;
};

const introuvable = (code: string) =>
  new ErreurApi(409, { code, detail: 'La ligne a changé : la liste est relue.' });

/** Une action sur les fournisseurs : l'écran prend l'instantané renvoyé. */
function useAction<Demande>(
  utilisateur: string | undefined,
  /** L'action sur le serveur ; elle rend ce que l'écran affiche en retour. */
  surLeServeur: (demande: Demande, contexte: Contexte) => Promise<Partial<Resultat>>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<Resultat> => {
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
  useAction<NouvelleCommande>(u, async (saisie) => {
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
  useAction<NouvelleReception>(u, async (saisie, contexte) => {
    const commande = commandeDe(contexte, saisie.commande);
    const reponse = await receptionsPlanifieesReceptionnerCreate(commande.idServeur, {
      quantite: decimal(saisie.quantite),
      ...(saisie.observation ? { observation: saisie.observation } : {}),
      ...(saisie.prix ? { prix_unitaire: saisie.prix } : {}),
    });
    const ecart = Number((reponse.data as { ecart?: string }).ecart ?? 0);
    return { commande: { statut: ecart < 0 ? 'partielle' : 'recue' } as Commande };
  });

export const useAnnulerReception = (u: string | undefined) =>
  useAction<{ commande: string }>(u, async ({ commande }, contexte) => {
    await receptionsPlanifieesAnnulerCreate(commandeDe(contexte, commande).idServeur);
    return {};
  });

export const useRelancer = (u: string | undefined) =>
  useAction<{ commande: string }>(u, async ({ commande }, contexte) => {
    const { manquant } = commandeDe(contexte, commande);
    if (manquant === undefined) throw introuvable('aucun_manquant');
    await manquantsRelancerCreate(manquant);
    return {};
  });

export const useReplanifier = (u: string | undefined) =>
  useAction<{ commande: string }>(u, async ({ commande }, contexte) => {
    const { manquant } = commandeDe(contexte, commande);
    if (manquant === undefined) throw introuvable('aucun_manquant');
    // Le serveur demande le jour : demain, comme la proposition de l'écran.
    const jour = contexte.avant?.jours[1] ?? contexte.avant?.jours[0] ?? '';
    await manquantsReplanifierCreate(manquant, { prevue_le: jour });
    return { reliquat: { jour } as Commande };
  });

export const usePayer = (u: string | undefined) =>
  useAction<NouveauPaiement>(u, async (saisie, { avant }) => {
    const facture = avant?.factures.find((f) => f.numero === saisie.facture);
    if (facture?.idServeur === undefined) throw introuvable('facture_inconnue');
    const reponse = await facturesPayerCreate(
      facture.idServeur,
      {
        // L'écran règle la facture en une fois : le montant est ce qu'il reste à payer.
        montant: facture.montant,
        mode: saisie.mode,
        ...(saisie.reference ? { reference: saisie.reference } : {}),
      },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    );
    return { depense: String((reponse.data as { depense: number }).depense) };
  });

/** Ouvre le reçu PDF d'un paiement dans un nouvel onglet. */
export function ouvrirLeRecu(paiement: number) {
  window.open(getPaiementsFournisseursRecuRetrieveUrl(paiement), '_blank', 'noopener');
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}

/** Crée un fournisseur, ou modifie celui dont l'identifiant est donné (gérant) : `POST` / `PATCH /fournisseurs/`. */
export function useEnregistrerFournisseur(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, saisie }: { id?: string; saisie: SaisieFournisseur }) => {
      const corps = {
        nom: saisie.nom,
        telephone: saisie.telephone,
        conditions: CODE_DES_CONDITIONS[saisie.conditions] as 'sept_jours',
        conditions_note: saisie.conditionsNote,
        matieres: saisie.matieres,
        actif: saisie.actif,
      };
      if (id) await fournisseursPartialUpdate(Number(id), corps);
      else await fournisseursCreate(corps);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: cleFournisseurs(utilisateur) }),
  });
}
