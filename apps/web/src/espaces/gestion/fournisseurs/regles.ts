import { SIMULATION } from '@/simulation';

import type { Profil } from '../../../profils.ts';
import { ajouterJours } from '../../atelier/stocks/regles.ts';
import type { Commande, Facture, Matiere } from './types.ts';

export { ajouterJours, quantiteSaisie } from '../../atelier/stocks/regles.ts';

export type DroitsFournisseurs = {
  /** Voir les réceptions, les fiches, les factures et les dettes. */
  voir: boolean;
  /** Planifier, réceptionner, relancer, replanifier et payer (matrice des droits §3.3). */
  modifier: boolean;
};

/** Le gérant gère les fournisseurs ; le propriétaire consulte ; les autres profils n'y ont pas accès. */
export function droitsFournisseurs(profil: Profil | null | undefined): DroitsFournisseurs {
  return {
    voir: profil === 'gerant' || profil === 'proprietaire',
    modifier: profil === 'gerant',
  };
}

export const arrondir = (valeur: number): number => Math.round(valeur * 100) / 100;

/** Jours où l'on peut planifier une réception : aujourd'hui et les sept suivants (maquette : `DAYS`). */
export const joursPlanifiables = (aujourdhui: string): string[] =>
  Array.from({ length: 8 }, (_, rang) => ajouterJours(aujourdhui, rang));

/** Prix d'une réception : quantité reçue × prix unitaire, arrondi au franc. */
export const montantDeReception = (quantite: number, prix: number): number =>
  Math.round(quantite * prix);

/** Ce qui manque encore à livrer sur un bon de commande. */
export const manque = (commande: Pick<Commande, 'commandee' | 'recue'>): number =>
  arrondir(commande.commandee - commande.recue);

/** Les réceptions à faire d'abord, les autres ensuite ; l'ordre d'arrivée est conservé. */
export function trierCommandes(commandes: readonly Commande[]): Commande[] {
  return [...commandes].sort(
    (a, b) => (a.statut === 'planifiee' ? 0 : 1) - (b.statut === 'planifiee' ? 0 : 1),
  );
}

export const facturesImpayees = (factures: readonly Facture[]): Facture[] =>
  factures.filter((f) => f.statut !== 'payee');

export const detteFournisseurs = (factures: readonly Facture[]): number =>
  facturesImpayees(factures).reduce((somme, f) => somme + f.montant, 0);

export const facturesEnRetard = (factures: readonly Facture[]): Facture[] =>
  facturesImpayees(factures).filter((f) => f.enRetard);

export const commandesAvecManque = (commandes: readonly Commande[]): Commande[] =>
  commandes.filter((c) => c.statut === 'partielle');

export const commandesPlanifiees = (commandes: readonly Commande[]): Commande[] =>
  commandes.filter((c) => c.statut === 'planifiee');

export type NiveauMot = 'ok' | 'surveiller' | 'bloquant' | 'neutre';

export const NIVEAU_COMMANDE: Record<Commande['statut'], NiveauMot> = {
  planifiee: 'neutre',
  recue: 'ok',
  partielle: 'surveiller',
};

/** Une facture en retard et à payer l'affiche ; une facture « en cours » garde son statut. */
export type EtatFacture = 'en-retard' | 'a-payer' | 'en-cours' | 'payee';

export function etatDeFacture(facture: Pick<Facture, 'statut' | 'enRetard'>): EtatFacture {
  return facture.enRetard && facture.statut === 'a-payer' ? 'en-retard' : facture.statut;
}

export const NIVEAU_FACTURE: Record<EtatFacture, NiveauMot> = {
  'en-retard': 'bloquant',
  'a-payer': 'surveiller',
  'en-cours': 'neutre',
  payee: 'ok',
};

/** Une facture se paie tant qu'elle est « à payer » (en retard comprise). */
export const sePaie = (facture: Pick<Facture, 'statut'>): boolean => facture.statut === 'a-payer';

/** Borne haute d'une quantité saisie (dans l'unité de la matière) : au-delà, c'est une faute de frappe. */
export const QUANTITE_MAX = 10_000;

/** Même borne sur le vrai serveur, où sel, levure et améliorant se comptent en grammes : 1 000 kg. */
export const QUANTITE_MAX_SERVEUR = 1_000_000;

export const quantiteTropGrande = (valeur: number, max: number = QUANTITE_MAX): boolean =>
  valeur > max;

/** La borne en vigueur à l'écran : celle du prototype en simulation, celle des grammes sur le vrai serveur. */
export const quantiteMax = (): number => (SIMULATION ? QUANTITE_MAX : QUANTITE_MAX_SERVEUR);

/** Une quantité à planifier ou à recevoir doit être un nombre strictement positif. */
export const quantiteValide = (valeur: number): boolean => Number.isFinite(valeur) && valeur > 0;

/** Conserve les chiffres, la virgule et le point (maquette : `replace(/[^\d.,]/g,'')`). */
export const filtrerQuantite = (texte: string): string => texte.replace(/[^\d.,]/g, '');

/** Matières que vend un fournisseur, pour le choix en cascade du formulaire. */
export const matieresDe = (
  fournisseurs: readonly { id: string; matieres: readonly Matiere[] }[],
  id: string,
): readonly Matiere[] => fournisseurs.find((f) => f.id === id)?.matieres ?? [];
