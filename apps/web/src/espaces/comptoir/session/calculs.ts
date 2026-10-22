import { formaterNombre, type NiveauStatut } from '@/utils';

import {
  CLES_PRODUIT,
  type CleProduit,
  type Client,
  type Livraison,
  type ModePaiement,
  type Quantites,
  type Saisies,
} from './types.ts';

/*
 * Règles du comptoir, reprises de la maquette « OptiBoul ERP v2 » (fonctions calc, plan, vSession).
 * Tous les montants sont des entiers en FCFA : jamais de flottants.
 */

/** Plafond de dette d'un client, en FCFA (réglage de la maquette). */
export const PLAFOND_PAR_DEFAUT = 2000;
/** Fonds de caisse à l'ouverture d'une session. */
export const FONDS_DE_CAISSE = 20000;

export type Produit = {
  cle: CleProduit;
  /** Libellé affiché dans les en-têtes et les champs. */
  libelle: string;
  /** Pains tirés d'un sac de farine : sert au plan de pétrissage. */
  painsParSac: number;
};

export const PRODUITS: readonly Produit[] = [
  { cle: 'BAG', libelle: 'BAG', painsParSac: 315 },
  { cle: 'KO', libelle: 'KO', painsParSac: 426 },
  { cle: 'GC', libelle: 'GC 135', painsParSac: 216 },
];

/** Ne garde que les chiffres : un champ de quantité ou de montant n'en accepte pas d'autres. */
export function chiffres(texte: string): string {
  return texte.replace(/\D/g, '');
}

/** Entier lu dans une saisie ; 0 si elle est vide ou sans chiffre. */
export function lireEntier(texte: string | undefined): number {
  const lu = Number.parseInt(chiffres(texte ?? ''), 10);
  return Number.isNaN(lu) ? 0 : lu;
}

export { formaterNombre, formaterNombreSigne as formaterSigne } from '@/utils';

/** Niveau d'un solde client : au-delà du plafond bloquant, en dette à surveiller, sinon à jour. */
export function niveauDuSolde(solde: number, plafond: number): NiveauStatut {
  if (solde < -plafond) return 'bloquant';
  return solde < 0 ? 'surveiller' : 'ok';
}

export type LigneLivraison = {
  cle: CleProduit;
  libelle: string;
  quantite: number;
  prix: number;
  total: number;
};

export type EntreeLivraison = {
  client: Client | undefined;
  saisies: Saisies;
  recu: string;
  mode: ModePaiement;
  reference: string;
  plafond: number;
  /** Solde le plus bas autorisé par le gérant pour ce client ; `null` sans autorisation. */
  soldeAutorise: number | null;
  /** La personne connectée peut saisir (caissier ou gérant, session ouverte). */
  peutSaisir: boolean;
};

export type CalculLivraison = {
  lignes: LigneLivraison[];
  du: number;
  recu: number;
  /** Reçu − dû. */
  reste: number;
  soldeApres: number;
  /** Le solde après livraison passe sous −plafond. */
  depasse: boolean;
  /** Dépassement non autorisé : la livraison est refusée. */
  bloquee: boolean;
  /** Complément à encaisser pour revenir sous le plafond. */
  manque: number;
  referenceManquante: boolean;
  /** La livraison peut être validée. */
  valide: boolean;
};

export function calculerLivraison(entree: EntreeLivraison): CalculLivraison {
  const { client, saisies, plafond } = entree;
  const lignes: LigneLivraison[] = PRODUITS.map(({ cle, libelle }) => {
    const quantite = lireEntier(saisies[cle]);
    const prix = client ? client.prix[cle] : 0;
    return { cle, libelle, quantite, prix, total: quantite * prix };
  });
  const du = lignes.reduce((somme, ligne) => somme + ligne.total, 0);
  const recu = lireEntier(entree.recu);
  const reste = recu - du;
  const soldeApres = client ? client.solde + reste : 0;
  const depasse = Boolean(client) && soldeApres < -plafond;
  // Une autorisation couvre le solde demandé, pas un solde plus bas.
  const autorise = entree.soldeAutorise !== null && soldeApres >= entree.soldeAutorise;
  const bloquee = depasse && !autorise;
  const referenceManquante = entree.mode !== 'especes' && entree.reference.trim() === '';
  return {
    lignes,
    du,
    recu,
    reste,
    soldeApres,
    depasse,
    bloquee,
    manque: Math.max(0, -plafond - soldeApres),
    referenceManquante,
    valide: Boolean(client) && du > 0 && !bloquee && !referenceManquante && entree.peutSaisir,
  };
}

export type TotauxSession = {
  du: number;
  recu: number;
  /** Nouvelles dettes de la session (somme des restes négatifs, donc ≤ 0). */
  dette: number;
  /** Anciennes dettes remboursées (somme des restes positifs). */
  remboursements: number;
  pains: number;
  especes: number;
  mtn: number;
  orange: number;
};

export function totauxDesLivraisons(livraisons: readonly Livraison[]): TotauxSession {
  const vide: TotauxSession = {
    du: 0,
    recu: 0,
    dette: 0,
    remboursements: 0,
    pains: 0,
    especes: 0,
    mtn: 0,
    orange: 0,
  };
  return livraisons.reduce<TotauxSession>(
    (total, livraison) => ({
      du: total.du + livraison.du,
      recu: total.recu + livraison.recu,
      dette: total.dette + Math.min(livraison.reste, 0),
      remboursements: total.remboursements + Math.max(livraison.reste, 0),
      pains:
        total.pains + livraison.quantites.BAG + livraison.quantites.KO + livraison.quantites.GC,
      especes: total.especes + (livraison.mode === 'especes' ? livraison.recu : 0),
      mtn: total.mtn + (livraison.mode === 'mtn' ? livraison.recu : 0),
      orange: total.orange + (livraison.mode === 'orange' ? livraison.recu : 0),
    }),
    vide,
  );
}

/** Espèces que la caisse doit contenir : fonds + espèces encaissées − dépenses payées en caisse. */
export function especesAttendues(fonds: number, especes: number, depensesCaisse: number): number {
  return fonds + especes - depensesCaisse;
}

export type EcartCaisse = {
  /** Les espèces ont été comptées. */
  compte: boolean;
  /** Compté − attendu : négatif = manque. */
  ecart: number;
  niveau: NiveauStatut;
};

export function ecartDeCaisse(comptees: string, attendues: number): EcartCaisse {
  const compte = comptees !== '';
  const ecart = lireEntier(comptees) - attendues;
  const niveau: NiveauStatut = !compte
    ? 'neutre'
    : ecart === 0
      ? 'ok'
      : ecart < 0
        ? 'bloquant'
        : 'surveiller';
  return { compte, ecart, niveau };
}

export type PlanDeSacs = Record<CleProduit, { pains: number; sacs: number }>;

/** Pains commandés et sacs à pétrir (arrondis au sac supérieur) pour chaque produit. */
export function planDeSacs(clients: readonly Client[], commandes: Record<string, Saisies>) {
  const plan = {} as PlanDeSacs;
  for (const produit of PRODUITS) {
    const pains = clients.reduce(
      (somme, client) => somme + lireEntier(commandes[client.id]?.[produit.cle]),
      0,
    );
    plan[produit.cle] = { pains, sacs: Math.ceil(pains / produit.painsParSac) };
  }
  return plan;
}

/** Montant estimé de la commande d'un client, à son tarif. */
export function montantEstime(client: Client, commande: Saisies | undefined): number {
  return CLES_PRODUIT.reduce(
    (somme, cle) => somme + lireEntier(commande?.[cle]) * client.prix[cle],
    0,
  );
}

/** Clients qui commandent d'habitude à cette session mais n'ont encore rien commandé. */
export function clientsSansCommande(
  clients: readonly Client[],
  commandes: Record<string, Saisies>,
  habituelles: Record<string, Quantites>,
): Client[] {
  return clients.filter((client) => {
    const habituelle = habituelles[client.id];
    const commande = commandes[client.id];
    return (
      habituelle !== undefined &&
      CLES_PRODUIT.some((cle) => habituelle[cle] > 0) &&
      CLES_PRODUIT.every((cle) => lireEntier(commande?.[cle]) === 0)
    );
  });
}

/** « 12 BAG · 3 KO » : la commande habituelle d'un client. */
export function texteHabituel(habituelle: Quantites | undefined): string {
  if (!habituelle) return '';
  return PRODUITS.filter(({ cle }) => habituelle[cle] > 0)
    .map(({ cle, libelle }) => `${formaterNombre(habituelle[cle])} ${libelle}`)
    .join(' · ');
}

const sansAccent = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Clients dont un mot du nom commence par ce qui est tapé (sans tenir compte des accents). */
export function filtrerClients(clients: readonly Client[], recherche: string): Client[] {
  const motif = sansAccent(recherche.trim());
  if (!motif) return [...clients];
  return clients.filter((client) =>
    sansAccent(client.nom)
      .split(/\s+/)
      .some((mot) => mot.startsWith(motif)),
  );
}
