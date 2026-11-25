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
  ModePaiement,
  Conditions,
  Facture,
  Fournisseur,
  InstantaneFournisseurs,
  StatutFacture,
} from './types.ts';

/*
 * Lecture de « Gestion › Fournisseurs » sur le vrai serveur : `fournisseurs/`, `receptions-planifiees/`,
 * `manquants/`, `factures/` et `semaines/` (numéro de semaine des factures). Le serveur relie chaque
 * manquant et chaque facture à son bon (`planifiee`, `reception_planifiee`), donne la quantité reçue
 * et le reste dû (voir E44 dans docs/integration-api-ecarts.md).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const matiereConnue = (code: string): code is Matiere =>
  (MATIERES as readonly string[]).includes(code);

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

/** « BC-032 » : le numéro du bon est celui de la réception planifiée. */
export const numeroDeCommande = (id: number) => `BC-${String(id).padStart(3, '0')}`;
export const numeroDeFacture = (numero: number) => `FAC-${numero}`;

const CONDITIONS: Record<string, Conditions> = {
  credit_lundi_mardi: 'credit-lundi-mardi',
  sept_jours: 'sept-jours',
  a_la_livraison: 'a-la-livraison',
};

/** Les conditions du serveur sont une liste fermée ; un texte libre (anciennes données) est interprété. */
export function conditionsDe(texte: string | undefined): Conditions {
  const connue = texte ? CONDITIONS[texte] : undefined;
  if (connue) return connue;
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

/** Les bons : la quantité reçue, qui l'a reçue et quand viennent de la réception ; le manquant se lit par son bon. */
export function versCommandes(
  planifiees: readonly ReceptionPlanifiee[],
  manquants: readonly Manquant[],
): Commande[] {
  const manquantDe = new Map<number, Manquant>();
  for (const m of [...manquants].sort((x, y) => y.id - x.id)) {
    if (!manquantDe.has(m.planifiee)) manquantDe.set(m.planifiee, m);
  }
  return planifiees
    .filter((p) => p.statut !== 'annulee' && matiereConnue(p.matiere))
    .map((p): Commande => {
      const manquant = manquantDe.get(p.id);
      const commandee = nombre(p.quantite);
      const recue = p.statut === 'planifiee' ? 0 : nombre(p.recue_quantite ?? p.quantite);
      const statut =
        p.statut === 'planifiee' ? 'planifiee' : recue < commandee ? 'partielle' : 'recue';
      return {
        numero: numeroDeCommande(p.id),
        fournisseur: String(p.fournisseur),
        matiere: p.matiere as Matiere,
        commandee,
        recue,
        jour: p.prevue_le,
        statut,
        planifieePar: p.planifiee_par,
        recuePar: p.recue_par ?? '',
        recueLe: p.recue_le
          ? { jour: jourDeYaounde(p.recue_le), heure: heureDeYaounde(p.recue_le) }
          : null,
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

export function versFacture(
  f: FactureServeur,
  semaines: ReadonlyMap<number, number>,
  planifiees: ReadonlyMap<number, ReceptionPlanifiee> = new Map(),
): Facture {
  const statut = STATUTS_FACTURE[f.statut] ?? 'a-payer';
  const bon = f.reception_planifiee === null ? undefined : planifiees.get(f.reception_planifiee);
  const paiement = f.paiement;
  return {
    numero: numeroDeFacture(f.numero),
    fournisseur: String(f.fournisseur),
    objet:
      bon && matiereConnue(bon.matiere) && f.quantite !== null
        ? {
            genre: 'reception',
            commande: numeroDeCommande(bon.id),
            matiere: bon.matiere as Matiere,
            recue: nombre(f.quantite),
            commandee: nombre(bon.quantite),
          }
        : { genre: 'serveur', farine: f.farine, semaine: semaines.get(f.semaine) ?? 0 },
    // Une facture payée en partie affiche ce qu'il reste à payer (E45) ; soldée, son montant.
    montant: statut === 'payee' ? f.montant : f.reste,
    echeance: f.echeance,
    statut,
    enRetard: f.en_retard,
    semaine: String(f.semaine),
    idServeur: f.id,
    ...(statut === 'payee' && paiement
      ? {
          payeeLe: jourDeYaounde(paiement.paye_le),
          mode: paiement.mode as ModePaiement,
          ...(paiement.reference ? { reference: paiement.reference } : {}),
          ...(paiement.depense === null ? {} : { depense: String(paiement.depense) }),
          paiement: paiement.id,
        }
      : {}),
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
  const bons = new Map(planifiees.map((p) => [p.id, p] as const));
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
    factures: factures.map((f) => versFacture(f, numeros, bons)),
  };
}
