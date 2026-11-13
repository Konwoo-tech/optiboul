import { SIMULATION } from '@/simulation';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';

import type { ActionsSession } from './api.ts';
import { calculerLivraison, chiffres, filtrerClients, lireEntier } from './calculs.ts';
import {
  CLES_PRODUIT,
  type CleProduit,
  type DemandePlafond,
  type InstantaneSession,
  type Livraison,
  type ModePaiement,
  type Saisies,
} from './types.ts';

type Formulaire = {
  clientId: string | null;
  saisies: Saisies;
  mode: ModePaiement;
  recu: string;
  reference: string;
};

const VIDE: Formulaire = {
  clientId: null,
  saisies: { BAG: '', KO: '', GC: '' },
  mode: 'especes',
  recu: '',
  reference: '',
};

/** Le champ prend le focus une fois affiché (le prototype attend 60 ms). */
function focaliser(champ: RefObject<HTMLInputElement | null>) {
  setTimeout(() => champ.current?.focus(), 60);
}

/** Champs du formulaire qui prennent le focus : créés par l'écran, qui les passe au hook et à l'onglet. */
export type ChampsLivraison = {
  recherche: RefObject<HTMLInputElement | null>;
  quantites: Record<CleProduit, RefObject<HTMLInputElement | null>>;
  recu: RefObject<HTMLInputElement | null>;
};

export function useChampsLivraison(): ChampsLivraison {
  const recherche = useRef<HTMLInputElement>(null);
  const BAG = useRef<HTMLInputElement>(null);
  const KO = useRef<HTMLInputElement>(null);
  const GC = useRef<HTMLInputElement>(null);
  const recu = useRef<HTMLInputElement>(null);
  return useMemo(
    () => ({ recherche, quantites: { BAG, KO, GC }, recu }),
    [recherche, BAG, KO, GC, recu],
  );
}

type Parametres = {
  champs: ChampsLivraison;
  instantane: InstantaneSession | undefined;
  peutSaisir: boolean;
  actions: ActionsSession;
  /** Livraison enregistrée par le serveur. */
  surEnregistree: (livraison: Livraison) => void;
  surErreur: (erreur: unknown) => void;
  /** Dépassement du plafond autorisé d'emblée (gérant) ou demande envoyée (caissier). */
  surAutorisation: (resultat: { autorise?: boolean; demande?: DemandePlafond }) => void;
};

/**
 * Brouillon de la livraison en cours : client choisi, quantités, mode, montant reçu. Il vit au
 * niveau de l'écran pour survivre au changement d'onglet, et pour que les raccourcis clavier
 * (F2, F4, Échap) y accèdent.
 */
export function useFormulaireLivraison({
  champs,
  instantane,
  peutSaisir,
  actions,
  surEnregistree,
  surErreur,
  surAutorisation,
}: Parametres) {
  const [recherche, setRecherche] = useState('');
  const [formulaire, setFormulaire] = useState<Formulaire>(VIDE);
  const enCours = useRef(false);
  // Une clé par envoi : la même si l'on renvoie la même saisie (réseau coupé), nouvelle dès qu'elle change.
  const cle = useRef<string | null>(null);
  const cleDeLEnvoi = () => (cle.current ??= crypto.randomUUID());

  const clients = instantane?.clients;
  const client = clients?.find((c) => c.id === formulaire.clientId);
  const autorisation = client ? instantane?.autorisations[client.id] : undefined;
  const demandeEnAttente = client
    ? instantane?.demandes.find((d) => d.clientId === client.id && d.statut === 'en-attente')
    : undefined;

  const calcul = useMemo(
    () =>
      calculerLivraison({
        client,
        saisies: formulaire.saisies,
        recu: formulaire.recu,
        mode: formulaire.mode,
        reference: formulaire.reference,
        plafond: instantane?.plafond ?? 0,
        soldeAutorise: autorisation ? autorisation.soldeApres : null,
        peutSaisir,
      }),
    [client, formulaire, instantane?.plafond, autorisation, peutSaisir],
  );

  const clientsFiltres = useMemo(
    () => (clients ? filtrerClients(clients, recherche) : []),
    [clients, recherche],
  );

  const selectionner = useCallback(
    (clientId: string) => {
      cle.current = null;
      setFormulaire({ ...VIDE, clientId });
      focaliser(champs.quantites.BAG);
    },
    [champs],
  );

  /** Recommence : plus de client, champs vides, la recherche reprend le focus (F2, Échap). */
  const reinitialiser = useCallback(() => {
    cle.current = null;
    setFormulaire(VIDE);
    setRecherche('');
    focaliser(champs.recherche);
  }, [champs]);

  /** Toute modification de la saisie change l'envoi : il faut une nouvelle clé. */
  const modifier = (changement: (avant: Formulaire) => Formulaire) => {
    cle.current = null;
    setFormulaire(changement);
  };

  const saisirQuantite = (produit: CleProduit, valeur: string) =>
    modifier((avant) => ({
      ...avant,
      saisies: { ...avant.saisies, [produit]: chiffres(valeur) },
    }));

  /** Entrée dans un champ de quantité : BAG → KO → GC → Reçu. */
  const passerAuSuivant = (cle: CleProduit) => {
    const rang = CLES_PRODUIT.indexOf(cle);
    const suivante = CLES_PRODUIT[rang + 1];
    (suivante ? champs.quantites[suivante] : champs.recu).current?.focus();
  };

  const valider = useCallback(async () => {
    if (!calcul.valide || !client || enCours.current) return;
    enCours.current = true;
    try {
      const reponse = await actions.livrer({
        clientId: client.id,
        quantites: {
          BAG: lireEntier(formulaire.saisies.BAG),
          KO: lireEntier(formulaire.saisies.KO),
          GC: lireEntier(formulaire.saisies.GC),
        },
        mode: formulaire.mode,
        recu: calcul.recu,
        reference: formulaire.reference.trim(),
        cle: cleDeLEnvoi(),
      });
      cle.current = null;
      setFormulaire(VIDE);
      setRecherche('');
      focaliser(champs.recherche);
      surEnregistree(reponse.livraison);
    } catch (erreur) {
      surErreur(erreur);
    } finally {
      enCours.current = false;
    }
  }, [actions, calcul.recu, calcul.valide, champs, client, formulaire, surEnregistree, surErreur]);

  const demanderAutorisation = useCallback(async () => {
    if (!client) return;
    try {
      const reponse = await actions.demanderAutorisation(client.id, calcul.soldeApres, {
        clientId: client.id,
        quantites: {
          BAG: lireEntier(formulaire.saisies.BAG),
          KO: lireEntier(formulaire.saisies.KO),
          GC: lireEntier(formulaire.saisies.GC),
        },
        mode: formulaire.mode,
        recu: calcul.recu,
        reference: formulaire.reference.trim(),
        cle: cleDeLEnvoi(),
      });
      cle.current = null;
      // Sur le vrai serveur, la livraison est déjà posée en attente : la saisie repart à zéro, pour
      // qu'on ne la renvoie pas une seconde fois une fois l'accord donné.
      if (!SIMULATION) reinitialiser();
      surAutorisation(reponse);
    } catch (erreur) {
      surErreur(erreur);
    }
  }, [
    actions,
    calcul.recu,
    calcul.soldeApres,
    client,
    formulaire,
    reinitialiser,
    surAutorisation,
    surErreur,
  ]);

  return {
    recherche,
    setRecherche,
    clientsFiltres,
    formulaire,
    client,
    calcul,
    autorisation,
    demandeEnAttente,
    selectionner,
    reinitialiser,
    saisirQuantite,
    passerAuSuivant,
    definirMode: (mode: ModePaiement) => modifier((avant) => ({ ...avant, mode })),
    saisirRecu: (valeur: string) => modifier((avant) => ({ ...avant, recu: chiffres(valeur) })),
    saisirReference: (reference: string) => modifier((avant) => ({ ...avant, reference })),
    /** « Exact » : le client paie juste ce qu'il doit. */
    recuExact: () => modifier((avant) => ({ ...avant, recu: String(calcul.du) })),
    /** « Encaisser … de plus » : le complément qui ramène le solde sous le plafond. */
    recuComplement: () =>
      modifier((avant) => ({ ...avant, recu: String(calcul.recu + calcul.manque) })),
    valider,
    demanderAutorisation,
  };
}

export type FormulaireLivraison = ReturnType<typeof useFormulaireLivraison>;
