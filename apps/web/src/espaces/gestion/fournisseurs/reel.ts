import {
  facturesList,
  fournisseursList,
  manquantsList,
  receptionsPlanifieesList,
  semainesList,
  toutesLesPages,
  type Facture as FactureServeur,
  type Fournisseur as FournisseurServeur,
  type Manquant,
  type ReceptionPlanifiee,
} from '@/api';

import { MATIERES, type Matiere } from '../../comptoir/depenses/types.ts';
import { joursPlanifiables } from './regles.ts';
import type {
  Commande,
  Conditions,
  Facture,
  Fournisseur,
  InstantaneFournisseurs,
  StatutFacture,
} from './types.ts';

/*
 * Lecture de « Gestion › Fournisseurs » sur le vrai serveur : `fournisseurs/`, `receptions-planifiees/`,
 * `manquants/`, `factures/` et `semaines/` (numéro de semaine des factures). Le serveur ne relie pas un
 * manquant à sa réception planifiée ni une facture à sa réception : l'écran rapproche par fournisseur
 * et matière (voir E44 dans docs/integration-api-ecarts.md).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const matiereConnue = (code: string): code is Matiere =>
  (MATIERES as readonly string[]).includes(code);

/** « BC-032 » : le numéro du bon est celui de la réception planifiée. */
export const numeroDeCommande = (id: number) => `BC-${String(id).padStart(3, '0')}`;
export const numeroDeFacture = (numero: number) => `FAC-${numero}`;

/** Le serveur garde un texte libre ; l'écran connaît trois conditions. */
export function conditionsDe(texte: string | undefined): Conditions {
  const t = (texte ?? '').toLowerCase();
  if (t.includes('lundi') || t.includes('mardi')) return 'credit-lundi-mardi';
  if (/\b7\b|sept|semaine/.test(t)) return 'sept-jours';
  return 'a-la-livraison';
}

/** « +237 699 10 20 30 » devient « 699 10 20 30 » (l'écran affiche l'indicatif lui-même). */
const sansIndicatif = (telephone: string | undefined) =>
  (telephone ?? '').replace(/^\s*(\+|00)?237\s*/, '').trim();

export function versFournisseur(f: FournisseurServeur): Fournisseur {
  const conditions = conditionsDe(f.conditions);
  return {
    id: String(f.id),
    nom: f.nom,
    matieres: f.matieres.filter(matiereConnue),
    telephone: sansIndicatif(f.telephone),
    conditions,
    credit: conditions !== 'a-la-livraison',
  };
}

const nombre = (texte: string | number) => Number(texte);

/**
 * Les bons : une réception planifiée reçue devient « partielle » quand un manquant lui correspond.
 * Le rapprochement prend, pour chaque manquant, la dernière réception reçue du même fournisseur et
 * de la même matière qui portait plus que le manquant.
 */
export function versCommandes(
  planifiees: readonly ReceptionPlanifiee[],
  manquants: readonly Manquant[],
): Commande[] {
  const manquantDe = new Map<number, Manquant>();
  const recues = planifiees.filter((p) => p.statut === 'recue').sort((a, b) => b.id - a.id);
  for (const m of [...manquants].sort((a, b) => b.id - a.id)) {
    const cible = recues.find(
      (p) =>
        p.fournisseur_nom === m.fournisseur &&
        p.matiere === m.matiere &&
        nombre(p.quantite) > nombre(m.quantite) &&
        !manquantDe.has(p.id),
    );
    if (cible) manquantDe.set(cible.id, m);
  }
  return planifiees
    .filter((p) => p.statut !== 'annulee' && matiereConnue(p.matiere))
    .map((p): Commande => {
      const manquant = manquantDe.get(p.id);
      const commandee = nombre(p.quantite);
      const recue =
        p.statut === 'planifiee' ? 0 : manquant ? commandee - nombre(manquant.quantite) : commandee;
      const statut = p.statut === 'planifiee' ? 'planifiee' : manquant ? 'partielle' : 'recue';
      return {
        numero: numeroDeCommande(p.id),
        fournisseur: String(p.fournisseur),
        matiere: p.matiere as Matiere,
        commandee,
        recue,
        jour: p.prevue_le,
        statut,
        planifieePar: p.planifiee_par,
        recuePar: '',
        recueLe: null,
        semaine: '',
        ...(manquant?.replanifiee ? { reliquat: numeroDeCommande(manquant.replanifiee) } : {}),
        idServeur: p.id,
        ...(manquant ? { manquant: manquant.id } : {}),
      };
    });
}

const STATUTS_FACTURE: Record<string, StatutFacture> = {
  a_payer: 'a-payer',
  // Payée en partie : l'écran la propose encore au paiement (E45).
  en_cours: 'a-payer',
  payee: 'payee',
};

export function versFacture(f: FactureServeur, semaines: ReadonlyMap<number, number>): Facture {
  return {
    numero: numeroDeFacture(f.numero),
    fournisseur: String(f.fournisseur),
    objet: { genre: 'serveur', farine: f.farine, semaine: semaines.get(f.semaine) ?? 0 },
    montant: f.montant,
    echeance: f.echeance,
    statut: STATUTS_FACTURE[f.statut] ?? 'a-payer',
    enRetard: f.en_retard,
    semaine: String(f.semaine),
    idServeur: f.id,
  };
}

/** Aujourd'hui à Yaoundé, « AAAA-MM-JJ ». */
const aujourdhuiLocal = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(new Date());

export async function lireFournisseursReels(): Promise<InstantaneFournisseurs> {
  const [fournisseurs, planifiees, manquants, factures, semaines] = await Promise.all([
    toutesLesPages<FournisseurServeur>(
      (page) => fournisseursList({ page }) as Promise<Page<FournisseurServeur>>,
    ),
    toutesLesPages<ReceptionPlanifiee>(
      (page) => receptionsPlanifieesList({ page }) as Promise<Page<ReceptionPlanifiee>>,
    ),
    toutesLesPages<Manquant>((page) => manquantsList({ page }) as Promise<Page<Manquant>>),
    toutesLesPages<FactureServeur>(
      (page) => facturesList({ page }) as Promise<Page<FactureServeur>>,
    ),
    toutesLesPages((page) => semainesList({ page })),
  ]);
  const numeros = new Map(semaines.map((s) => [s.id, s.numero] as const));
  const aujourdhui = aujourdhuiLocal();
  return {
    aujourdhui,
    jours: joursPlanifiables(aujourdhui),
    fournisseurs: fournisseurs.filter((f) => f.actif !== false).map(versFournisseur),
    commandes: versCommandes(
      planifiees,
      manquants.filter((m) => m.statut !== 'livre'),
    ).sort((a, b) => (a.idServeur ?? 0) - (b.idServeur ?? 0)),
    factures: factures.map((f) => versFacture(f, numeros)),
  };
}
