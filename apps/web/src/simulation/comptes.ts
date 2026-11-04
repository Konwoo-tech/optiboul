import type { CompteSimule, GroupeSimule, UtilisateurSimule } from './donnees.ts';

/*
 * Comptes et groupes en vigueur dans le faux serveur : les comptes de démonstration (`donnees.ts`)
 * plus ce que l'administrateur y ajoute ou y change (Gestion › Utilisateurs, US-020 à US-022).
 * C'est la seule source des comptes pour la connexion, la session, les plannings et les
 * autorisations : ne plus lire `COMPTES_SIMULES` directement. Sans import de valeur : ce module
 * ne peut pas former de cycle. Tout vit en mémoire.
 */

export type CanalVerification = 'sms' | 'whatsapp';

export type CompteVivant = CompteSimule & {
  /** Désactivé, le compte ne peut plus se connecter ni être affecté. */
  actif: boolean;
  /** Canal par défaut du code de double authentification. */
  canal: CanalVerification;
};

type Etat = { comptes: CompteVivant[]; groupes: GroupeSimule[] };

let courant: Etat | undefined;

/**
 * Comptes et groupes de départ. Ils sont déclarés au lancement de la simulation (`routeur.ts`),
 * pas importés ici : un import direct des données laisserait les comptes dans le paquet de
 * production (le compilateur garde alors la fonction d'initialisation, même inutilisée).
 */
let depart: { comptes: readonly CompteSimule[]; groupes: readonly GroupeSimule[] } = {
  comptes: [],
  groupes: [],
};

export function declarerComptesDeDepart(
  comptes: readonly CompteSimule[],
  groupes: readonly GroupeSimule[],
): void {
  depart = { comptes, groupes };
  courant = undefined;
}

const etatInitial = (): Etat => ({
  comptes: depart.comptes.map((c) => ({ ...c, actif: true, canal: 'sms' as const })),
  groupes: depart.groupes.map((g) => ({ ...g })),
});

const lireEtat = (): Etat => (courant ??= etatInitial());

/** Remet les comptes et les groupes à leur état de départ (tests). */
export function reinitialiserComptes(): void {
  courant = undefined;
}

/** Tous les comptes, désactivés compris, dans l'ordre de création. */
export const tousLesComptes = (): readonly CompteVivant[] => lireEtat().comptes;

/** Comptes qui peuvent se connecter et être affectés. */
export const comptesActifs = (): readonly CompteVivant[] =>
  lireEtat().comptes.filter((c) => c.actif);

export const compteParId = (id: string): CompteVivant | undefined =>
  lireEtat().comptes.find((c) => c.id === id);

/** Ce que l'écran de connexion a le droit de voir des comptes actifs. */
export const utilisateursActifs = (): UtilisateurSimule[] =>
  comptesActifs().map(({ id, nom, profil, email }) => ({ id, nom, profil, email }));

export const tousLesGroupes = (): readonly GroupeSimule[] => lireEtat().groupes;

export const groupeParId = (id: string): GroupeSimule | undefined =>
  lireEtat().groupes.find((g) => g.id === id);

export function ajouterCompte(compte: CompteVivant): void {
  lireEtat().comptes.push(compte);
}

/** Le groupe porte le profil : le compte prend celui du nouveau groupe, tout de suite. */
export function affecterAuGroupe(id: string, groupe: GroupeSimule): void {
  const compte = compteParId(id);
  if (compte) {
    compte.groupe = groupe.id;
    compte.profil = groupe.profil;
  }
}

export function definirActivation(id: string, actif: boolean): void {
  const compte = compteParId(id);
  if (compte) compte.actif = actif;
}

export function noterAcces(id: string, dernierAcces: string): void {
  const compte = compteParId(id);
  if (compte) compte.dernierAcces = dernierAcces;
}

export function ajouterGroupe(groupe: GroupeSimule): void {
  lireEtat().groupes.push(groupe);
}
