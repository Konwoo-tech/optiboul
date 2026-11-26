import { useBrouillon } from '@/ui';
import { createRef, useCallback, useMemo, useRef, useState, type RefObject } from 'react';

import type { ActionsSession } from './api.ts';
import { calculerLivraison, chiffres, filtrerClients, lireEntier } from './calculs.ts';
import { CLES_PRODUIT, parProduit } from './catalogue.ts';
import {
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

const videFormulaire = (): Formulaire => ({
  clientId: null,
  saisies: parProduit(''),
  mode: 'especes',
  recu: '',
  reference: '',
});

/** Le champ prend le focus une fois affiché (le prototype attend 60 ms). */
function focaliser(champ: RefObject<HTMLInputElement | null>) {
  setTimeout(() => champ.current?.focus(), 60);
}

/** Champs du formulaire qui prennent le focus : créés par l'écran, qui les passe au hook et à l'onglet. */
export type ChampsLivraison = {
  recherche: RefObject<HTMLInputElement | null>;
  /** Le champ de quantité d'un produit : créé à la demande, le catalogue peut grandir. */
  quantite: (cle: CleProduit) => RefObject<HTMLInputElement | null>;
  recu: RefObject<HTMLInputElement | null>;
};

export function useChampsLivraison(): ChampsLivraison {
  const recherche = useRef<HTMLInputElement>(null);
  const quantites = useRef<Record<CleProduit, RefObject<HTMLInputElement | null>>>({});
  const recu = useRef<HTMLInputElement>(null);
  return useMemo(
    () => ({
      recherche,
      quantite: (cle: CleProduit) => (quantites.current[cle] ??= createRef<HTMLInputElement>()),
      recu,
    }),
    [recherche, recu],
  );
}

type Parametres = {
  champs: ChampsLivraison;
  instantane: InstantaneSession | undefined;
  peutSaisir: boolean;
  actions: ActionsSession;
  /** Livraison enregistrée par le serveur. */
  surEnregistree: (livraison: Livraison) => void;
  /** Paiement de dette enregistré par le serveur (sans livraison). */
  surEncaissee: (paiement: { nom: string; montant: number }) => void;
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
  surEncaissee,
  surErreur,
  surAutorisation,
}: Parametres) {
  const [recherche, setRecherche] = useState('');
  const [formulaire, setFormulaire] = useState<Formulaire>(videFormulaire);
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
        paiementSeul: true,
        plafond: instantane?.plafond ?? 0,
        soldeAutorise: autorisation ? autorisation.soldeApres : null,
        peutSaisir,
      }),
    [client, formulaire, instantane?.plafond, autorisation, peutSaisir],
  );

  // La saisie en cours suit la personne : elle la retrouve après « Changer d'utilisateur ».
  useBrouillon<Formulaire>(
    'livraison',
    formulaire,
    formulaire.clientId === null,
    (contenu) => {
      if (contenu?.clientId && clients?.some((c) => c.id === contenu.clientId)) {
        setFormulaire({ ...videFormulaire(), ...contenu });
      }
    },
    peutSaisir && Boolean(instantane),
  );

  const clientsFiltres = useMemo(
    () => (clients ? filtrerClients(clients, recherche) : []),
    [clients, recherche],
  );

  const selectionner = useCallback(
    (clientId: string) => {
      cle.current = null;
      setFormulaire({ ...videFormulaire(), clientId });
      focaliser(champs.quantite(CLES_PRODUIT[0] ?? 'BAG'));
    },
    [champs],
  );

  /**
   * Recommence : plus de client, champs vides, la recherche reprend le focus (F2, Échap), sauf quand
   * une fenêtre s'ouvre aussitôt (le code du gérant) : le focus lui revient.
   */
  const reinitialiser = useCallback(
    (avecFocus = true) => {
      cle.current = null;
      setFormulaire(videFormulaire());
      setRecherche('');
      if (avecFocus === true) focaliser(champs.recherche);
    },
    [champs],
  );

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
    (suivante ? champs.quantite(suivante) : champs.recu).current?.focus();
  };

  const valider = useCallback(async () => {
    if (!calcul.valide || !client || enCours.current) return;
    enCours.current = true;
    try {
      if (calcul.paiementDeDette) {
        await actions.encaisser({
          clientId: client.id,
          mode: formulaire.mode,
          recu: calcul.recu,
          reference: formulaire.reference.trim(),
          cle: cleDeLEnvoi(),
        });
        cle.current = null;
        setFormulaire(videFormulaire());
        setRecherche('');
        focaliser(champs.recherche);
        surEncaissee({ nom: client.nom, montant: calcul.recu });
        return;
      }
      const reponse = await actions.livrer({
        clientId: client.id,
        quantites: Object.fromEntries(
          CLES_PRODUIT.map((cle) => [cle, lireEntier(formulaire.saisies[cle])]),
        ),
        mode: formulaire.mode,
        recu: calcul.recu,
        reference: formulaire.reference.trim(),
        cle: cleDeLEnvoi(),
      });
      cle.current = null;
      setFormulaire(videFormulaire());
      setRecherche('');
      focaliser(champs.recherche);
      surEnregistree(reponse.livraison);
    } catch (erreur) {
      surErreur(erreur);
    } finally {
      enCours.current = false;
    }
  }, [
    actions,
    calcul.paiementDeDette,
    calcul.recu,
    calcul.valide,
    champs,
    client,
    formulaire,
    surEncaissee,
    surEnregistree,
    surErreur,
  ]);

  /** « Livrer comme commandé » : une livraison depuis la commande, avec le paiement saisi s'il y en a un. */
  const livrerCommeCommande = useCallback(async () => {
    if (!client || enCours.current) return;
    enCours.current = true;
    try {
      const reponse = await actions.livrerCommeCommande({
        clientId: client.id,
        mode: formulaire.mode,
        recu: calcul.recu,
        reference: formulaire.reference.trim(),
        cle: cleDeLEnvoi(),
      });
      cle.current = null;
      setFormulaire(videFormulaire());
      setRecherche('');
      focaliser(champs.recherche);
      surEnregistree(reponse.livraison);
    } catch (erreur) {
      surErreur(erreur);
    } finally {
      enCours.current = false;
    }
  }, [actions, calcul.recu, champs, client, formulaire, surEnregistree, surErreur]);

  const demanderAutorisation = useCallback(async () => {
    if (!client) return;
    try {
      const reponse = await actions.demanderAutorisation(client.id, {
        clientId: client.id,
        quantites: Object.fromEntries(
          CLES_PRODUIT.map((cle) => [cle, lireEntier(formulaire.saisies[cle])]),
        ),
        mode: formulaire.mode,
        recu: calcul.recu,
        reference: formulaire.reference.trim(),
        cle: cleDeLEnvoi(),
      });
      cle.current = null;
      // Sur le vrai serveur, la livraison est déjà posée en attente : la saisie repart à zéro, pour
      // qu'on ne la renvoie pas une seconde fois une fois l'accord donné.
      reinitialiser(!reponse.demande);
      surAutorisation(reponse);
    } catch (erreur) {
      surErreur(erreur);
    }
  }, [actions, calcul.recu, client, formulaire, reinitialiser, surAutorisation, surErreur]);

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
    livrerCommeCommande,
    demanderAutorisation,
  };
}

export type FormulaireLivraison = ReturnType<typeof useFormulaireLivraison>;
