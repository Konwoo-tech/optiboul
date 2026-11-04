import { peutVoirTableauDeBord } from '@/espaces/gestion/tableau-de-bord/regles.ts';
import type {
  Alerte,
  InstantaneTableauDeBord,
  ProductionDuProduit,
} from '@/espaces/gestion/tableau-de-bord/types.ts';

import { manquesDeCaisse } from './caisses.ts';
import { clientsSimules, PLAFOND } from './clients.ts';
import { demandesDePlafond, syntheseDeSession } from './comptoir.ts';
import { budgetDuMois, demandesDeDepense } from './depenses.ts';
import { commandesPartiellesSimulees, facturesSimulees } from './fournisseurs.ts';
import { signauxDeProduction } from './production.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { demandesDInventaire, matieresEnStockBas } from './stocks.ts';

/*
 * Faux serveur de « Gestion › Tableau de bord » (US-171, récits US-130 à US-134) : les données et
 * les règles de la maquette « OptiBoul ERP v2 » (fonction `vDashboard`). Il ne garde rien : il lit
 * les chiffres à leur source : la session (recette), les clients (dettes, la même source que
 * l'écran Clients), les caisses (manques), les dépenses (budget), les stocks (stock bas, le même
 * niveau que l'écran Stocks), la production (non clôturée, écart de matières), les demandes. Ne
 * sont pas encore simulés ailleurs, donc portés ici en données de départ : le cumul du mois avant
 * la session, les recettes des nuits passées et la production du mois. Les factures et les
 * réceptions partielles viennent de `fournisseurs.ts`.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/gestion/tableau-de-bord/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

/** Encaissé et dû depuis le début du mois, avant la session en cours (maquette : 4172950, 4337800). */
const CUMUL_AVANT_SESSION = { encaisse: 4_172_950, du: 4_337_800 } as const;

/** Recettes des treize nuits précédentes (maquette : `N`). La session en cours fait la quatorzième. */
const RECETTES_DES_NUITS = [
  312_400, 298_750, 335_100, 341_200, 305_600, 288_900, 352_300, 318_750, 327_400, 301_200, 344_650,
  336_900, 309_800,
] as const;

type Facture = { numero: string; montant: number; payee: boolean; enRetard: boolean };

/** Fonctions et non constantes : aucun appel au chargement du module, rien dans le paquet de production. */

/** Factures fournisseurs : lues dans `fournisseurs.ts`, leur source (écran Gestion › Fournisseurs). */
const factures = (): Facture[] =>
  facturesSimulees().map((f) => ({
    numero: f.numero,
    montant: f.montant,
    payee: f.statut === 'payee',
    enRetard: f.enRetard,
  }));

/** Réceptions partielles (bons livrés en partie) : le manquant reste à relancer ou à replanifier. */
const receptionsPartielles = () =>
  commandesPartiellesSimulees().map((c) => ({
    commande: c.numero,
    matiere: c.matiere,
    commandee: c.commandee,
    recue: c.recue,
  }));

/** Production du mois par produit, en pains (maquette : `prodBars`). */
const production = (): ProductionDuProduit[] => [
  { produit: 'BAG', pains: 34_120 },
  { produit: 'KO', pains: 15_400 },
  { produit: 'GC 135', pains: 4_300 },
  { produit: 'GC 170', pains: 620 },
  { produit: 'PL', pains: 1_150 },
  { produit: 'C2', pains: 80 },
  { produit: 'PSL', pains: 0 },
];

/** Jours de session précédents, du plus ancien au plus récent, sans la session en cours. */
function joursPrecedents(jour: string, nombre: number): string[] {
  return Array.from({ length: nombre }, (_, i) => {
    const date = new Date(`${jour}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (nombre - i));
    return date.toISOString().slice(0, 10);
  });
}

/** Les alertes, dans l'ordre de la maquette : les urgentes (rouges), puis les « à voir » (ambre). */
function alertes(): Alerte[] {
  const enRetard = factures().filter((f) => !f.payee && f.enRetard);
  const bas = matieresEnStockBas();
  const auDela = clientsSimules().filter((c) => c.solde < -PLAFOND).length;
  const signaux = signauxDeProduction();
  const budgets = budgetDuMois().lignes.filter((ligne) => ligne.realise > ligne.budget);
  const enAttente =
    demandesDePlafond().filter((d) => d.statut === 'en-attente').length +
    demandesDeDepense().filter(({ demande }) => demande.statut === 'en-attente').length +
    demandesDInventaire().filter(({ demande }) => demande.statut === 'en-attente').length;

  const liste: Alerte[] = [
    ...enRetard.map((f): Alerte => ({
      id: `facture-${f.numero}`,
      niveau: 'bloquant',
      type: 'facture-en-retard',
      numero: f.numero,
      montant: f.montant,
      destination: { espace: 'gestion', ecran: 'fournisseurs', parametres: { onglet: 'dettes' } },
    })),
    ...bas.map((matiere): Alerte => ({
      id: `stock-${matiere}`,
      niveau: 'bloquant',
      type: 'stock-bas',
      matiere,
      destination: { espace: 'atelier', ecran: 'stocks', parametres: { onglet: 'etat' } },
    })),
  ];
  if (auDela > 0) {
    liste.push({
      id: 'clients-plafond',
      niveau: 'bloquant',
      type: 'clients-au-dela-du-plafond',
      clients: auDela,
      plafond: PLAFOND,
      destination: { espace: 'gestion', ecran: 'clients', parametres: { filtre: 'depasse' } },
    });
  }
  for (const ligne of budgets) {
    liste.push({
      id: `budget-${ligne.categorie}`,
      niveau: 'bloquant',
      type: 'budget-depasse',
      categorie: ligne.categorie,
      destination: { espace: 'gestion', ecran: 'depenses' },
    });
  }
  for (const p of signaux.nonCloturees) {
    liste.push({
      id: `production-${p.jour}-${p.creneau}`,
      niveau: 'bloquant',
      type: 'production-non-cloturee',
      jour: p.jour,
      creneau: p.creneau,
      destination: { espace: 'atelier', ecran: 'production' },
    });
  }
  for (const r of receptionsPartielles()) {
    liste.push({
      id: `manquant-${r.commande}`,
      niveau: 'surveiller',
      type: 'manquant-fournisseur',
      commande: r.commande,
      matiere: r.matiere,
      manque: r.commandee - r.recue,
      destination: {
        espace: 'gestion',
        ecran: 'fournisseurs',
        parametres: { onglet: 'receptions' },
      },
    });
  }
  for (const c of manquesDeCaisse()) {
    liste.push({
      id: `caisse-${c.jour}-${c.type}`,
      niveau: 'surveiller',
      type: 'manque-de-caisse',
      jour: c.jour,
      creneau: c.type,
      caissiere: c.caissiere,
      ecart: c.ecart,
      destination: { espace: 'comptoir', ecran: 'caisses' },
    });
  }
  if (enAttente > 0) {
    liste.push({
      id: 'demandes',
      niveau: 'surveiller',
      type: 'demandes-en-attente',
      nombre: enAttente,
      destination: { espace: 'gestion', ecran: 'demandes' },
    });
  }
  for (const e of signaux.ecartsMatiere) {
    liste.push({
      id: `ecart-matiere-${e.motif}`,
      niveau: 'surveiller',
      type: 'ecart-matiere',
      par: e.par,
      motif: e.motif,
      destination: {
        espace: 'atelier',
        ecran: 'production',
        parametres: { onglet: 'consommation' },
      },
    });
  }
  return liste;
}

/** Semaine en cours, telle que la coque la connaît (`CONTEXTE` du routeur). */
export type SemaineEnCours = {
  gerantDeLaSemaine: string;
  responsableProduction: string;
  semaine: { numero: number; du: string; au: string };
};

function instantane(contexte: SemaineEnCours): InstantaneTableauDeBord {
  const session = syntheseDeSession();
  const enDette = clientsSimules().filter((c) => c.solde < 0);
  const impayees = factures().filter((f) => !f.payee);
  const jours = [...joursPrecedents(session.jour, RECETTES_DES_NUITS.length), session.jour];
  const montants = [...RECETTES_DES_NUITS, session.recu];

  return {
    mois: budgetDuMois().mois,
    recette: {
      encaissee: CUMUL_AVANT_SESSION.encaisse + session.recu,
      due: CUMUL_AVANT_SESSION.du + session.du,
    },
    dettesClients: {
      montant: -enDette.reduce((somme, c) => somme + c.solde, 0),
      clients: enDette.length,
      auDessusDuPlafond: enDette.filter((c) => c.solde < -PLAFOND).length,
    },
    dettesFournisseurs: {
      montant: impayees.reduce((somme, f) => somme + f.montant, 0),
      facturesEnRetard: impayees.filter((f) => f.enRetard).length,
    },
    semaine: {
      ...contexte.semaine,
      gerant: contexte.gerantDeLaSemaine,
      production: contexte.responsableProduction,
    },
    recettesParNuit: jours.map((jour, i) => ({ jour, montant: montants[i]! })),
    production: production(),
    alertes: alertes(),
  };
}

/**
 * Réponses de « Gestion › Tableau de bord ». Renvoie `undefined` pour une route qui n'est pas la
 * sienne : le routeur général répond alors « pas encore simulé ». Lecture seule : le gérant et le
 * propriétaire voient le tableau de bord (cahier des charges §3.3), personne d'autre.
 */
export function repondreTableauDeBord(
  url: URL,
  methode: string,
  _corps: Corps,
  contexte: SemaineEnCours,
): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutVoirTableauDeBord(utilisateur.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');
  }

  switch (appel) {
    case 'GET ':
      return Response.json(instantane(contexte));
    default:
      return undefined;
  }
}
