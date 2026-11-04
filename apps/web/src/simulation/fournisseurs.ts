import {
  arrondir,
  facturesImpayees,
  manque,
  montantDeReception,
} from '@/espaces/gestion/fournisseurs/regles.ts';
import type {
  Commande,
  Facture,
  Fournisseur,
  ModePaiement,
  ObjetFacture,
  StatutFacture,
} from '@/espaces/gestion/fournisseurs/types.ts';
import type { Matiere } from '@/espaces/comptoir/depenses/types.ts';
import { ajouterJours } from '@/espaces/atelier/stocks/regles.ts';

import { dateDuJour, heureCourante } from './comptoir.ts';
import { lireSemaines, semaineDuJourSimulee } from './planning.ts';

/*
 * Fournisseurs, bons de commande, réceptions et factures : l'état de la maquette « OptiBoul ERP
 * v2 » (`suppliers`, `orders`, `invoices`). C'est la SEULE source de ces données : le faux serveur
 * de « Gestion › Fournisseurs » (`fournisseursApi.ts`), le tableau de bord (alertes, dette), les
 * semaines (contrôles de clôture, réceptions de la semaine), le stock (prochaine réception) et les
 * dépenses (fournisseur d'un achat) les lisent ici. Les jours sont relatifs à aujourd'hui, comme
 * dans `stocks.ts` (la maquette est figée au mercredi 14 octobre). Sans import de `stocks.ts` ni
 * de `depenses.ts` : ce module ne peut pas former de cycle avec eux.
 */

/** Fonctions et non constantes : aucun appel au chargement du module, rien dans le paquet de production. */
const FOURNISSEURS = (): Fournisseur[] => [
  {
    id: 'f1',
    nom: 'Grands Moulins du Centre',
    matieres: ['farine'],
    telephone: '6 99 10 20 30',
    conditions: 'credit-lundi-mardi',
    credit: true,
  },
  {
    id: 'f2',
    nom: 'Mfoundi Levures & Sel',
    matieres: ['levure', 'sel', 'ameliorant'],
    telephone: '6 77 45 12 09',
    conditions: 'sept-jours',
    credit: true,
  },
  {
    id: 'f3',
    nom: 'Glacière d’Olembé',
    matieres: ['glace'],
    telephone: '6 55 60 71 82',
    conditions: 'a-la-livraison',
    credit: false,
  },
  {
    id: 'f4',
    nom: 'Bois Nkolondom',
    matieres: ['bois'],
    telephone: '6 94 22 38 15',
    conditions: 'sept-jours',
    credit: true,
  },
  {
    id: 'f5',
    nom: 'Huilerie Mvog-Mbi',
    matieres: ['huile'],
    telephone: '6 70 81 54 26',
    conditions: 'a-la-livraison',
    credit: false,
  },
];

/** Facture telle que stockée : le statut « en cours / à payer » d'une facture de farine se déduit de sa semaine. */
type FactureStockee = Omit<Facture, 'enRetard'>;

type Journal = { heure: string; qui: string; quoi: string };

type Etat = {
  aujourdhui: string;
  commandes: Commande[];
  factures: FactureStockee[];
  journal: Journal[];
};

function etatInitial(): Etat {
  const aujourdhui = dateDuJour();
  const j = (decalage: number) => ajouterJours(aujourdhui, decalage);
  const commande = (
    numero: string,
    fournisseur: string,
    matiere: Matiere,
    commandee: number,
    recue: number,
    jour: string,
    statut: Commande['statut'],
    recueLe: Commande['recueLe'],
    semaine: string,
  ): Commande => ({
    numero,
    fournisseur,
    matiere,
    commandee,
    recue,
    jour,
    statut,
    planifieePar: 'Willy',
    recuePar: recueLe ? 'Willy' : '',
    recueLe,
    semaine,
  });
  return {
    aujourdhui,
    commandes: [
      commande(
        'BC-030',
        'f3',
        'glace',
        60,
        60,
        j(0),
        'recue',
        { jour: j(0), heure: '08:20' },
        'S42',
      ),
      commande(
        'BC-031',
        'f1',
        'farine',
        44,
        44,
        j(-2),
        'recue',
        { jour: j(-2), heure: '08:10' },
        'S42',
      ),
      commande(
        'BC-032',
        'f2',
        'levure',
        10,
        6,
        j(-1),
        'partielle',
        { jour: j(-1), heure: '10:05' },
        'S42',
      ),
      commande('BC-034', 'f2', 'levure', 8, 0, j(0), 'planifiee', null, 'S42'),
      commande('BC-033', 'f1', 'farine', 40, 0, j(1), 'planifiee', null, 'S42'),
      commande('BC-035', 'f4', 'bois', 3, 0, j(2), 'planifiee', null, 'S42'),
      commande('BC-036', 'f5', 'huile', 20, 0, j(5), 'planifiee', null, 'S43'),
    ],
    factures: [
      {
        numero: 'FAC-41',
        fournisseur: 'f1',
        objet: { genre: 'farine', semaine: 41, sacs: 72 },
        montant: 1_405_800,
        echeance: j(-1),
        statut: 'en-cours',
        semaine: 'S41',
      },
      {
        numero: 'FAC-42',
        fournisseur: 'f1',
        objet: { genre: 'farine', semaine: 42, sacs: 44 },
        montant: 859_100,
        echeance: j(5),
        statut: 'en-cours',
        semaine: 'S42',
      },
      {
        numero: 'FAC-0213',
        fournisseur: 'f2',
        objet: {
          genre: 'reception',
          commande: 'BC-032',
          matiere: 'levure',
          recue: 6,
          commandee: 10,
        },
        montant: 30_000,
        echeance: j(6),
        statut: 'a-payer',
        semaine: 'S42',
      },
      {
        numero: 'FAC-0198',
        fournisseur: 'f4',
        objet: { genre: 'livraison', commande: 'BC-027', matiere: 'bois', quantite: 2 },
        montant: 40_000,
        echeance: j(-5),
        statut: 'a-payer',
        semaine: 'S41',
      },
      {
        numero: 'FAC-40',
        fournisseur: 'f1',
        objet: { genre: 'farine', semaine: 40, sacs: 81 },
        montant: 1_581_525,
        echeance: j(-9),
        statut: 'payee',
        semaine: 'S41',
        payeeLe: j(-9),
        mode: 'banque',
      },
    ],
    journal: [],
  };
}

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

/** Remet les fournisseurs à leur état de départ (tests). */
export function reinitialiserFournisseurs(): void {
  courant = undefined;
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalFournisseurs(): readonly Journal[] {
  return lireEtat().journal;
}

export function tracerFournisseurs(qui: string, quoi: string): void {
  const etat = lireEtat();
  etat.journal = [{ heure: heureCourante(), qui, quoi }, ...etat.journal];
}

export const fournisseursSimules = (): Fournisseur[] => FOURNISSEURS();

export const fournisseurSimule = (id: string): Fournisseur | undefined =>
  FOURNISSEURS().find((f) => f.id === id);

export const commandesSimulees = (): Commande[] => structuredClone(lireEtat().commandes);

/** Aujourd'hui pour les fournisseurs : le jour où l'état de départ a été daté. */
export const aujourdhuiFournisseurs = (): string => lireEtat().aujourdhui;

/**
 * Une facture de farine se cumule sur la semaine : elle est « en cours » tant que la semaine n'est
 * pas clôturée, puis « à payer ». Les autres factures gardent leur statut.
 */
function statutDe(facture: FactureStockee): StatutFacture {
  if (facture.statut === 'payee' || facture.objet.genre !== 'farine') return facture.statut;
  const semaine = lireSemaines().find((s) => s.id === facture.semaine);
  return semaine?.statut === 'cloturee' ? 'a-payer' : 'en-cours';
}

export function facturesSimulees(): Facture[] {
  const { aujourdhui, factures } = lireEtat();
  return structuredClone(factures).map((f) => {
    const statut = statutDe(f);
    return { ...f, statut, enRetard: statut !== 'payee' && f.echeance < aujourdhui };
  });
}

/** Prochain numéro de bon de commande : « BC-037 » après BC-036. */
function prochainBon(): string {
  const dernier = Math.max(0, ...lireEtat().commandes.map((c) => Number(c.numero.slice(3))));
  return `BC-${String(dernier + 1).padStart(3, '0')}`;
}

/** Prochain numéro de facture d'une réception : « FAC-0214 » après FAC-0213. */
function prochaineFacture(): string {
  const dernier = Math.max(
    0,
    ...lireEtat()
      .factures.filter((f) => /^FAC-0\d+$/.test(f.numero))
      .map((f) => Number(f.numero.slice(4))),
  );
  return `FAC-0${dernier + 1}`;
}

export type NouveauBon = {
  fournisseur: string;
  matiere: Matiere;
  quantite: number;
  jour: string;
  par: string;
};

/** Planifie une réception : un bon de commande « planifié » rattaché à la semaine de son jour. */
export function planifierBon(bon: NouveauBon): Commande {
  const etat = lireEtat();
  const cree: Commande = {
    numero: prochainBon(),
    fournisseur: bon.fournisseur,
    matiere: bon.matiere,
    commandee: bon.quantite,
    recue: 0,
    jour: bon.jour,
    statut: 'planifiee',
    planifieePar: bon.par,
    recuePar: '',
    recueLe: null,
    semaine: semaineDuJourSimulee(bon.jour).id,
  };
  etat.commandes = [...etat.commandes, cree];
  return structuredClone(cree);
}

export type ResultatReception = {
  commande: Commande;
  facture: Facture;
  /** Quantité qui entre en stock (plafonnée à la commande). */
  quantite: number;
};

/**
 * Réception d'un bon planifié : la quantité livrée (plafonnée à la commande) fait passer le bon
 * à « reçu » ou « manquant », et la facture naît : la farine se cumule sur la facture de sa semaine,
 * le reste crée une facture à l'échéance du fournisseur. L'entrée de stock est faite par l'appelant.
 */
export function receptionnerBon(
  numero: string,
  livree: number,
  prix: number,
  par: string,
): ResultatReception | undefined {
  const etat = lireEtat();
  const bon = etat.commandes.find((c) => c.numero === numero);
  if (!bon || bon.statut !== 'planifiee') return undefined;
  const recue = Math.min(livree, bon.commandee);
  const partielle = recue < bon.commandee;
  const montant = montantDeReception(recue, prix);
  const fournisseur = fournisseurSimule(bon.fournisseur);

  bon.recue = recue;
  bon.statut = partielle ? 'partielle' : 'recue';
  bon.recuePar = par;
  bon.recueLe = { jour: etat.aujourdhui, heure: heureCourante() };

  const cumul =
    bon.matiere === 'farine'
      ? etat.factures.find(
          (f) => f.objet.genre === 'farine' && f.semaine === bon.semaine && f.statut !== 'payee',
        )
      : undefined;
  let numeroFacture: string;
  if (cumul && cumul.objet.genre === 'farine') {
    cumul.objet = { ...cumul.objet, sacs: arrondir(cumul.objet.sacs + recue) };
    cumul.montant += montant;
    numeroFacture = cumul.numero;
  } else {
    const semaine = lireSemaines().find((s) => s.id === bon.semaine);
    const farine = bon.matiere === 'farine' && fournisseur?.credit && semaine;
    numeroFacture =
      farine && !etat.factures.some((f) => f.numero === `FAC-${semaine.numero}`)
        ? `FAC-${semaine.numero}`
        : prochaineFacture();
    const objet: ObjetFacture = farine
      ? { genre: 'farine', semaine: semaine.numero, sacs: recue }
      : {
          genre: 'reception',
          commande: bon.numero,
          matiere: bon.matiere,
          recue,
          ...(partielle ? { commandee: bon.commandee } : {}),
        };
    etat.factures = [
      {
        numero: numeroFacture,
        fournisseur: bon.fournisseur,
        objet,
        montant,
        // Farine : payée le lundi suivant la semaine ; autre crédit : 7 jours ; sinon à la livraison.
        echeance: farine
          ? ajouterJours(semaine.au, 1)
          : fournisseur?.credit
            ? ajouterJours(etat.aujourdhui, 7)
            : etat.aujourdhui,
        statut: 'a-payer',
        semaine: bon.semaine,
      },
      ...etat.factures,
    ];
  }
  const facture = facturesSimulees().find((f) => f.numero === numeroFacture)!;
  return { commande: structuredClone(bon), facture, quantite: recue };
}

/**
 * Replanifie ce qui manque d'un bon partiel : le bon d'origine est soldé à la quantité reçue et un
 * nouveau bon planifié porte le reliquat, pour demain (maquette : « jeu. 15 oct. »).
 */
export function replanifierReliquat(
  numero: string,
  par: string,
): { origine: Commande; reliquat: Commande } | undefined {
  const etat = lireEtat();
  const origine = etat.commandes.find((c) => c.numero === numero);
  if (!origine || origine.statut !== 'partielle') return undefined;
  const reste = manque(origine);
  const jour = ajouterJours(etat.aujourdhui, 1);
  const reliquat: Commande = {
    numero: prochainBon(),
    fournisseur: origine.fournisseur,
    matiere: origine.matiere,
    commandee: reste,
    recue: 0,
    jour,
    statut: 'planifiee',
    planifieePar: par,
    recuePar: '',
    recueLe: null,
    semaine: semaineDuJourSimulee(jour).id,
  };
  origine.commandee = origine.recue;
  origine.statut = 'recue';
  origine.reliquat = reliquat.numero;
  etat.commandes = [...etat.commandes, reliquat];
  return { origine: structuredClone(origine), reliquat: structuredClone(reliquat) };
}

export type ResultatPaiement = 'ok' | 'inconnue' | 'non-payable';

/** Marque une facture payée (le faux serveur crée la dépense, puis appelle `lierDepense`). */
export function payerFacture(
  numero: string,
  mode: ModePaiement,
  reference = '',
): { resultat: ResultatPaiement; facture?: Facture } {
  const etat = lireEtat();
  const stockee = etat.factures.find((f) => f.numero === numero);
  if (!stockee) return { resultat: 'inconnue' };
  if (statutDe(stockee) !== 'a-payer') return { resultat: 'non-payable' };
  stockee.statut = 'payee';
  stockee.payeeLe = etat.aujourdhui;
  stockee.mode = mode;
  if (reference) stockee.reference = reference;
  return { resultat: 'ok', facture: facturesSimulees().find((f) => f.numero === numero) };
}

/** Garde le numéro de la dépense créée par le paiement (reçu PDF). */
export function lierDepense(numero: string, depense: string): void {
  const stockee = lireEtat().factures.find((f) => f.numero === numero);
  if (stockee) stockee.depense = depense;
}

/* ----- Lectures des autres écrans ----- */

/** Réceptions rattachées à chaque semaine (écran des semaines). */
export function receptionsParSemaine(): Record<string, number> {
  const parSemaine: Record<string, number> = {};
  for (const c of lireEtat().commandes) parSemaine[c.semaine] = (parSemaine[c.semaine] ?? 0) + 1;
  return parSemaine;
}

/** Réceptions planifiées, la plus proche d'abord : « Prochaine réception » de l'état du stock. */
export function receptionsPlanifiees(): Array<{
  matiere: Matiere;
  jour: string;
  quantite: number;
}> {
  return lireEtat()
    .commandes.filter((c) => c.statut === 'planifiee')
    .map((c) => ({ matiere: c.matiere, jour: c.jour, quantite: c.commandee }))
    .sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
}

/** Dette fournisseurs : factures pas encore payées, dont celles en retard. */
export function detteFournisseursSimulee(): { montant: number; enRetard: number } {
  const impayees = facturesImpayees(facturesSimulees());
  return {
    montant: impayees.reduce((somme, f) => somme + f.montant, 0),
    enRetard: impayees.filter((f) => f.enRetard).length,
  };
}

/** Bons livrés en partie : un manquant à relancer ou à replanifier (alertes). */
export const commandesPartiellesSimulees = (): Commande[] =>
  commandesSimulees().filter((c) => c.statut === 'partielle');

const NOMS_FR: Record<Matiere, string> = {
  farine: 'Farine',
  sel: 'Sel',
  levure: 'Levure',
  ameliorant: 'Améliorant',
  glace: 'Glace',
  bois: 'Bois',
  huile: 'Huile',
};

const UNITES_FR: Record<Matiere, string> = {
  farine: 'sacs',
  sel: 'kg',
  levure: 'kg',
  ameliorant: 'kg',
  glace: 'sachets',
  bois: 'chargements',
  huile: 'litres',
};

/** Libellé français d'une facture, pour les écrans qui l'affichent tel quel (contrôles de clôture). */
export function libelleFactureFr(facture: Pick<Facture, 'objet' | 'statut'>): string {
  const { objet } = facture;
  if (objet.genre === 'farine') {
    const suite = facture.statut === 'en-cours' ? ' à ce jour' : '';
    return `Farine · semaine ${objet.semaine} (${objet.sacs} sacs${suite})`;
  }
  if (objet.genre === 'reception') {
    const sur = objet.commandee !== undefined ? ` reçus sur ${objet.commandee}` : '';
    return `${objet.commande} · ${NOMS_FR[objet.matiere]}, ${objet.recue} ${UNITES_FR[objet.matiere]}${sur}`;
  }
  return `${NOMS_FR[objet.matiere]} · ${objet.quantite} ${UNITES_FR[objet.matiere]} (${objet.commande})`;
}
