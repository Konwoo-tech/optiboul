import {
  ajouterJours,
  arrondir,
  controleDuJour,
  droitsStocks,
  ecartDepasseLaTolerance,
  effet,
  lignesEnEcart,
  niveauDuStock,
  numeroInventaire,
} from '@/espaces/atelier/stocks/regles.ts';
import {
  MATIERES,
  TYPES_SAISIS,
  type Controle,
  type FicheMatiere,
  type Inventaire,
  type InstantaneStocks,
  type Matiere,
  type Mouvement,
  type OrigineMouvement,
  type ReceptionPlanifiee,
} from '@/espaces/atelier/stocks/types.ts';
import type { Profil } from '../profils.ts';

import { dateDuJour, heureCourante } from './comptoir.ts';
import { receptionsPlanifiees } from './fournisseurs.ts';
import { prochainNumeroDemande } from './numerosDemandes.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur d'« Atelier › Stocks » (US-169, récits US-090 à US-094) : les données et les règles
 * de la maquette « OptiBoul ERP v2 » (états `mats`, `stockMoves`, `audits`, fonctions `vStocks`,
 * `auditPatch`). C'est la seule source des mouvements de stock : les entrées créées par l'écran
 * Dépenses passent par `entrerEnStockDepuisDepense`. Tout vit en mémoire ; l'historique de départ
 * est daté par rapport à aujourd'hui (la maquette est figée au mercredi 14 octobre).
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/atelier/stocks/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

/** Sacs de farine par session sur lesquels le besoin est calculé (plan de la maquette). */
const SACS_PAR_SESSION = 6;

type FicheDepart = {
  stock: number;
  /** Besoin par sac de farine ; absent : `fixe` par session. */
  parSac?: number;
  fixe?: number;
  prix: number;
};

const FICHES: Record<Matiere, FicheDepart> = {
  farine: { stock: 30, parSac: 1, prix: 19_525 },
  sel: { stock: 14.4, parSac: 0.6, prix: 300 },
  levure: { stock: 2.7, parSac: 0.45, prix: 5_000 },
  ameliorant: { stock: 7.2, parSac: 0.3, prix: 4_000 },
  glace: { stock: 120, parSac: 5, prix: 1_000 },
  bois: { stock: 4, fixe: 1, prix: 20_000 },
  huile: { stock: 20, fixe: 3, prix: 1_500 },
};

const besoin = (cle: Matiere): number => {
  const { parSac, fixe } = FICHES[cle];
  return fixe ?? arrondir((parSac ?? 0) * SACS_PAR_SESSION);
};

type DemandeInventaire = {
  id: string;
  numero: number;
  inventaireId: string;
  par: string;
  parProfil: Profil;
  jour: string;
  heure: string;
  statut: 'en-attente' | 'acceptee' | 'refusee';
  decidePar: string;
  decideA: string;
};

type Journal = { heure: string; qui: string; quoi: string };

type Etat = {
  aujourdhui: string;
  stock: Record<Matiere, number>;
  mouvements: Mouvement[];
  inventaires: Inventaire[];
  demandes: DemandeInventaire[];
  journal: Journal[];
};

/** Lundi de la semaine du jour donné. */
function lundiDe(iso: string): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  return ajouterJours(iso, -((jour.getUTCDay() + 6) % 7));
}

/** Numéro de semaine ISO (le 14 octobre 2026 est en semaine 42). */
function semaineIso(iso: string): number {
  const jour = new Date(`${iso}T12:00:00Z`);
  const jeudi = new Date(jour);
  jeudi.setUTCDate(jour.getUTCDate() + 3 - ((jour.getUTCDay() + 6) % 7));
  const premier = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((jeudi.getTime() - premier.getTime()) / 86_400_000 - 3 + ((premier.getUTCDay() + 6) % 7)) /
        7,
    )
  );
}

const GERANT_PRECEDENT = 'Patrick';
const GERANT_COURANT = 'Willy';
const RESPONSABLE_PRODUCTION = 'Serge';

/** Contrôles du mercredi et du dimanche : semaine précédente et semaine courante. */
function controles(aujourdhui: string): Controle[] {
  const lundi = lundiDe(aujourdhui);
  const precedente = semaineIso(ajouterJours(lundi, -7));
  const courante = semaineIso(lundi);
  const un = (semaine: number, decalage: number, moment: Controle['moment'], gerant: string) => ({
    semaine,
    jour: ajouterJours(lundi, decalage),
    moment,
    gerant,
    responsableProduction: RESPONSABLE_PRODUCTION,
  });
  return [
    un(precedente, -5, 'mercredi', GERANT_PRECEDENT),
    un(precedente, -1, 'dimanche', GERANT_PRECEDENT),
    un(courante, 2, 'mercredi', GERANT_COURANT),
    un(courante, 6, 'dimanche', GERANT_COURANT),
  ];
}

function etatInitial(): Etat {
  const aujourdhui = dateDuJour();
  const j = (decalage: number) => ajouterJours(aujourdhui, decalage);
  const lundi = lundiDe(aujourdhui);
  const jourAud06 = ajouterJours(lundi, -5);
  const jourAud07 = ajouterJours(lundi, -1);
  let rang = 0;
  const m = (
    jour: string,
    heure: string,
    type: Mouvement['type'],
    matiere: Matiere,
    quantite: number,
    origine: OrigineMouvement,
    par: string,
  ): Mouvement => ({
    id: `SM-depart-${++rang}`,
    jour,
    heure,
    type,
    matiere,
    quantite,
    origine,
    par,
  });
  const prod = (creneau: 'jour' | 'nuit', date: string): OrigineMouvement => ({
    genre: 'production',
    creneau,
    date,
  });
  const aud07: OrigineMouvement = { genre: 'inventaire', code: 'AUD-07', date: jourAud07 };

  const mouvements: Mouvement[] = [
    m(
      j(0),
      '19:10',
      'entree',
      'levure',
      5,
      { genre: 'depense', code: 'DEP-0016', achat: 'caisse' },
      'Davy',
    ),
    m(j(0), '13:42', 'sortie', 'farine', 6, prod('jour', j(0)), 'Serge'),
    m(j(0), '13:42', 'sortie', 'levure', 2.7, prod('jour', j(0)), 'Serge'),
    m(
      j(0),
      '08:20',
      'entree',
      'glace',
      60,
      { genre: 'reception', code: 'BC-030', fournisseur: 'Glacière d’Olembé', partielle: false },
      'Willy',
    ),
    m(
      j(-1),
      '10:05',
      'entree',
      'levure',
      6,
      { genre: 'reception', code: 'BC-032', fournisseur: 'Mfoundi Levures & Sel', partielle: true },
      'Willy',
    ),
    m(j(-1), '05:20', 'sortie', 'farine', 8, prod('nuit', j(-1)), 'Serge'),
    m(j(-1), '05:20', 'sortie', 'levure', 3.9, prod('nuit', j(-1)), 'Serge'),
    m(j(-1), '13:35', 'sortie', 'farine', 6, prod('jour', j(-1)), 'Serge'),
    m(j(-1), '13:35', 'sortie', 'levure', 2.7, prod('jour', j(-1)), 'Serge'),
    m(j(-2), '13:40', 'sortie', 'farine', 6, prod('jour', j(-2)), 'Serge'),
    m(j(-2), '13:40', 'sortie', 'levure', 2.7, prod('jour', j(-2)), 'Serge'),
    m(j(-2), '05:10', 'sortie', 'farine', 9, prod('nuit', j(-3)), 'Serge'),
    m(j(-2), '05:10', 'sortie', 'levure', 4, prod('nuit', j(-3)), 'Serge'),
    m(
      j(-2),
      '08:10',
      'entree',
      'farine',
      44,
      {
        genre: 'reception',
        code: 'BC-031',
        fournisseur: 'Grands Moulins du Centre',
        partielle: false,
      },
      'Willy',
    ),
    m(jourAud07, '21:30', 'ajustement', 'sel', -0.8, aud07, 'Patrick'),
    m(jourAud07, '21:30', 'ajustement', 'levure', -0.4, aud07, 'Patrick'),
  ];

  const stock = Object.fromEntries(MATIERES.map((c) => [c, FICHES[c].stock])) as Record<
    Matiere,
    number
  >;

  // Comme la maquette, le comptage du dernier dimanche est recalé sur le stock actuel : le stock
  // compté ce jour-là est le stock d'aujourd'hui moins les mouvements enregistrés depuis.
  const comptagesBruts: Array<[Matiere, number, number]> = [
    ['farine', 12, 12],
    ['sel', 9.6, 8.8],
    ['levure', 2.1, 1.7],
    ['ameliorant', 5.4, 5.4],
    ['glace', 40, 38],
    ['bois', 2, 2],
    ['huile', 14, 14],
  ];
  const lignes07 = comptagesBruts.map(([matiere, theo, phys]) => {
    const apres = mouvements
      .filter((x) => x.matiere === matiere && x.jour > jourAud07)
      .reduce((somme, x) => somme + effet(x), 0);
    const compte = Math.max(0, arrondir(stock[matiere] - apres));
    return { matiere, theorique: arrondir(compte + (theo - phys)), compte };
  });

  const aud06: Inventaire = {
    id: 'AUD-06',
    numero: 6,
    jour: jourAud06,
    heure: '14:20',
    par: 'Patrick',
    statut: 'valide',
    validePar: 'Patrick',
    lignes: [
      ['farine', 31, 31],
      ['sel', 11.2, 11],
      ['levure', 4.5, 4.5],
      ['ameliorant', 6.6, 6.6],
      ['glace', 52, 50],
      ['bois', 3, 3],
      ['huile', 18, 18],
    ].map(([matiere, theorique, compte]) => ({
      matiere: matiere as Matiere,
      theorique: theorique as number,
      compte: compte as number,
    })),
  };
  const aud07Complet: Inventaire = {
    id: 'AUD-07',
    numero: 7,
    jour: jourAud07,
    heure: '21:00',
    par: 'Patrick',
    statut: 'valide',
    validePar: 'M. Fotso',
    lignes: lignes07,
  };

  return {
    aujourdhui,
    stock,
    mouvements,
    inventaires: [aud06, aud07Complet],
    demandes: [],
    journal: [],
  };
}

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

let sequence = 0;

/** Remet les stocks à leur état de départ (tests). */
export function reinitialiserStocks(): void {
  courant = undefined;
  sequence = 0;
}

/**
 * Un contrôle de stock est prévu aujourd'hui et aucun inventaire n'a encore été compté : la
 * notification « Contrôle de stock à faire aujourd'hui » reste affichée, puis disparaît.
 */
export function controleDeStockAFaire(): boolean {
  const { aujourdhui, inventaires } = lireEtat();
  return controleDuJour(controles(aujourdhui), inventaires, aujourdhui) !== undefined;
}

/**
 * Matières au niveau « stock bas » de l'écran Stocks (moins d'une session, avec le même besoin par
 * session) : l'alerte du tableau de bord.
 */
export function matieresEnStockBas(): Matiere[] {
  const { stock } = lireEtat();
  return MATIERES.filter((cle) => niveauDuStock(stock[cle], besoin(cle)) === 'bas');
}

/**
 * Matières dont le stock ne couvre pas une session de `sacs` sacs de farine (passation : « stock
 * bas »). Sans plan de production, la maquette compte 8 sacs.
 */
export function matieresSousLeBesoin(sacs: number = SACS_PAR_SESSION): Matiere[] {
  const { stock } = lireEtat();
  return MATIERES.filter((cle) => {
    const { parSac, fixe } = FICHES[cle];
    return stock[cle] < (fixe ?? arrondir((parSac ?? 0) * sacs));
  });
}

/** Actions tracées dans le journal, plus récentes en premier (tests). */
export function journalStocks(): readonly Journal[] {
  return lireEtat().journal;
}

/** Mouvements de stock, plus récents d'abord (tests). */
export function mouvementsDeStock(): readonly Mouvement[] {
  return lireEtat().mouvements;
}

/** Stock actuel de chaque matière, dans l'unité du stock (farine en sacs) : lu par la production. */
export function stockDesMatieres(): Record<Matiere, number> {
  return { ...lireEtat().stock };
}

/** Prix unitaire de chaque matière, relevé des derniers achats (FCFA) : lu par les fiches techniques. */
export function prixDesMatieres(): Record<Matiere, number> {
  return Object.fromEntries(MATIERES.map((cle) => [cle, FICHES[cle].prix])) as Record<
    Matiere,
    number
  >;
}

function tracer(qui: string, quoi: string) {
  lireEtat().journal = [{ heure: heureCourante(), qui, quoi }, ...lireEtat().journal];
}

/** Réceptions planifiées (bons de commande à recevoir) : lues dans `fournisseurs.ts`, leur source. */
function receptions(): ReceptionPlanifiee[] {
  return receptionsPlanifiees();
}

function instantane(): InstantaneStocks {
  const etat = lireEtat();
  const matieres: FicheMatiere[] = MATIERES.map((cle) => ({
    cle,
    stock: etat.stock[cle],
    besoin: besoin(cle),
    prix: FICHES[cle].prix,
  }));
  return structuredClone({
    aujourdhui: etat.aujourdhui,
    sacsParSession: SACS_PAR_SESSION,
    matieres,
    receptions: receptions(),
    mouvements: etat.mouvements,
    inventaires: etat.inventaires,
    controles: controles(etat.aujourdhui),
  });
}

export type ActeurStocks = { nom: string; profil: 'production' | 'gerant' | 'proprietaire' };

function acteur(): ActeurStocks | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { profil, nom } = utilisateur;
  if (profil === 'production' || profil === 'gerant' || profil === 'proprietaire') {
    return { nom, profil };
  }
  return undefined;
}

function ajouterMouvement(
  type: Mouvement['type'],
  matiere: Matiere,
  quantite: number,
  origine: OrigineMouvement,
  par: string,
): Mouvement {
  const etat = lireEtat();
  const mouvement: Mouvement = {
    id: `SM${Date.now()}-${++sequence}`,
    jour: dateDuJour(),
    heure: heureCourante(),
    type,
    matiere,
    quantite,
    origine,
    par,
  };
  etat.mouvements = [mouvement, ...etat.mouvements];
  etat.stock[matiere] = Math.max(0, arrondir(etat.stock[matiere] + effet(mouvement)));
  return mouvement;
}

/**
 * Entrée de stock créée par une dépense rattachée au stock (écran Dépenses) : le stock de la
 * matière augmente et le mouvement porte le numéro de la dépense.
 */
export function entrerEnStockDepuisDepense(entree: {
  matiere: Matiere;
  quantite: number;
  code: string;
  /** Nom du fournisseur ; `null` : achat au marché. */
  fournisseur: string | null;
  par: string;
}): void {
  ajouterMouvement(
    'entree',
    entree.matiere,
    entree.quantite,
    entree.fournisseur
      ? {
          genre: 'depense',
          code: entree.code,
          achat: 'fournisseur',
          fournisseur: entree.fournisseur,
        }
      : { genre: 'depense', code: entree.code, achat: 'marche' },
    entree.par,
  );
}

/**
 * Entrée de stock créée par la réception d'un bon de commande (écran Fournisseurs, US-101) : le
 * stock de la matière augmente de la quantité réellement livrée, le mouvement porte le numéro du
 * bon et le fournisseur, et signale une livraison partielle.
 */
export function entrerEnStockDepuisReception(entree: {
  matiere: Matiere;
  quantite: number;
  /** Numéro du bon de commande, « BC-032 ». */
  code: string;
  fournisseur: string;
  partielle: boolean;
  par: string;
}): void {
  ajouterMouvement(
    'entree',
    entree.matiere,
    entree.quantite,
    {
      genre: 'reception',
      code: entree.code,
      fournisseur: entree.fournisseur,
      partielle: entree.partielle,
    },
    entree.par,
  );
}

/**
 * Sorties de stock créées à la clôture d'une production (R5, US-091) : une sortie par matière
 * consommée, rattachée à la session. Symétrique de `entrerEnStockDepuisDepense` ; la clôture de
 * production (écran Production) l'appelle. Le stock ne descend jamais sous zéro.
 */
export function sortirDuStockDepuisProduction(sortie: {
  creneau: 'jour' | 'nuit';
  /** Jour de la session, « AAAA-MM-JJ ». */
  date: string;
  consommations: ReadonlyArray<{ matiere: Matiere; quantite: number }>;
  par: string;
}): Mouvement[] {
  return sortie.consommations
    .filter((c) => c.quantite > 0)
    .map((c) =>
      ajouterMouvement(
        'sortie',
        c.matiere,
        c.quantite,
        { genre: 'production', creneau: sortie.creneau, date: sortie.date },
        sortie.par,
      ),
    );
}

const dans = <T extends string>(valeurs: readonly T[], valeur: unknown): valeur is T =>
  typeof valeur === 'string' && (valeurs as readonly string[]).includes(valeur);

function creerMouvement(a: ActeurStocks, corps: Corps): Response {
  if (!droitsStocks(a.profil).modifier) return refus();
  const { type, matiere, quantite } = corps;
  const motif = typeof corps.motif === 'string' ? corps.motif.trim() : '';
  if (!dans(TYPES_SAISIS, type)) return probleme(400, 'type_inconnu', 'Type de mouvement inconnu.');
  if (!dans(MATIERES, matiere)) return probleme(400, 'matiere_inconnue', 'Matière inconnue.');
  if (typeof quantite !== 'number' || !Number.isFinite(quantite) || quantite <= 0) {
    return probleme(400, 'quantite_obligatoire', 'Indiquez une quantité.');
  }
  if (!motif) return probleme(400, 'motif_obligatoire', 'Motif obligatoire.');
  if (type === 'perte' && quantite > lireEtat().stock[matiere]) {
    return probleme(409, 'stock_insuffisant', 'La perte dépasse le stock disponible.');
  }
  const mouvement = ajouterMouvement(type, matiere, quantite, { genre: 'manuel', motif }, a.nom);
  tracer(
    a.nom,
    `Mouvement de stock manuel : ${type === 'entree' ? 'entrée' : 'perte'} ${quantite} ${matiere} – ${motif}`,
  );
  return Response.json({ instantane: instantane(), mouvement });
}

/** Ajuste le stock sur les écarts d'un inventaire accepté, par la différence comptée − théorique. */
function ajuster(inventaire: Inventaire) {
  for (const ligne of lignesEnEcart(inventaire)) {
    ajouterMouvement(
      'ajustement',
      ligne.matiere,
      arrondir(ligne.compte - ligne.theorique),
      { genre: 'inventaire', code: inventaire.id, date: inventaire.jour },
      inventaire.par,
    );
  }
}

function creerInventaire(a: ActeurStocks, corps: Corps): Response {
  if (!droitsStocks(a.profil).modifier) return refus();
  const comptages = corps.comptages;
  if (typeof comptages !== 'object' || comptages === null) {
    return probleme(400, 'comptage_incomplet', 'Comptez toutes les matières avant de soumettre.');
  }
  const etat = lireEtat();
  // Un seul inventaire à la fois attend le propriétaire : un second comptage serait calculé sur un stock
  // que l'accord du premier va encore changer.
  if (etat.inventaires.some((i) => i.statut === 'a-valider')) {
    return probleme(
      409,
      'inventaire_en_attente',
      'Un inventaire attend déjà la validation du propriétaire.',
    );
  }
  const lignes = [];
  for (const matiere of MATIERES) {
    const compte = (comptages as Record<string, unknown>)[matiere];
    if (typeof compte !== 'number' || !Number.isFinite(compte) || compte < 0) {
      return probleme(400, 'comptage_incomplet', 'Comptez toutes les matières avant de soumettre.');
    }
    lignes.push({ matiere, theorique: etat.stock[matiere], compte });
  }
  const numero = Math.max(0, ...etat.inventaires.map((i) => i.numero)) + 1;
  const attend = ecartDepasseLaTolerance(lignes);
  const inventaire: Inventaire = {
    id: numeroInventaire(numero),
    numero,
    jour: dateDuJour(),
    heure: heureCourante(),
    par: a.nom,
    statut: attend ? 'a-valider' : 'valide',
    validePar: attend ? '' : a.nom,
    lignes,
  };
  let demande: DemandeInventaire | undefined;
  if (attend) {
    demande = {
      id: `q-inv-${numero}`,
      numero: prochainNumeroDemande(),
      inventaireId: inventaire.id,
      par: a.nom,
      parProfil: a.profil,
      jour: inventaire.jour,
      heure: inventaire.heure,
      statut: 'en-attente',
      decidePar: '',
      decideA: '',
    };
    inventaire.demandeNumero = demande.numero;
    etat.demandes = [demande, ...etat.demandes];
  }
  etat.inventaires = [...etat.inventaires, inventaire];
  if (!attend) ajuster(inventaire);
  tracer(
    a.nom,
    attend
      ? `Inventaire ${inventaire.id} soumis au propriétaire (écart > 5 %)`
      : `Inventaire ${inventaire.id} validé · stock ajusté`,
  );
  return Response.json({ instantane: instantane(), inventaire, demande });
}

/** Demandes d'inventaire avec leur inventaire, plus récentes d'abord (écran « Demandes »). */
export function demandesDInventaire(): ReadonlyArray<{
  demande: DemandeInventaire;
  inventaire: Inventaire;
}> {
  const etat = lireEtat();
  return etat.demandes.flatMap((demande) => {
    const inventaire = etat.inventaires.find((i) => i.id === demande.inventaireId);
    return inventaire ? [structuredClone({ demande, inventaire })] : [];
  });
}

export type ResultatDecisionInventaire = 'ok' | 'inconnue' | 'interdit' | 'deja-decidee';

/**
 * Accord ou refus d'une demande d'inventaire : réservé au propriétaire (R9). Un accord ajuste le
 * stock sur les écarts comptés ; un refus ne touche pas au stock.
 */
export function trancherDemandeDInventaire(
  qui: { nom: string; profil: Profil },
  id: string,
  accord: boolean,
): ResultatDecisionInventaire {
  const etat = lireEtat();
  const demande = etat.demandes.find((d) => d.id === id);
  if (!demande) return 'inconnue';
  if (qui.profil !== 'proprietaire') return 'interdit';
  if (demande.statut !== 'en-attente') return 'deja-decidee';
  const inventaire = etat.inventaires.find((i) => i.id === demande.inventaireId)!;
  demande.statut = accord ? 'acceptee' : 'refusee';
  demande.decidePar = qui.nom;
  demande.decideA = heureCourante();
  inventaire.statut = accord ? 'valide' : 'refuse';
  inventaire.validePar = qui.nom;
  if (accord) ajuster(inventaire);
  tracer(qui.nom, `${accord ? 'Accord' : 'Refus'} – Inventaire ${inventaire.id}`);
  return 'ok';
}

/**
 * Réponses d'« Atelier › Stocks ». Renvoie `undefined` pour une route qui n'est pas la sienne :
 * le routeur général répond alors « pas encore simulé ».
 */
export function repondreStocks(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a || !droitsStocks(a.profil).voir) return refus();

  switch (appel) {
    case 'GET ':
      return Response.json(instantane());
    case 'POST mouvements/':
      return creerMouvement(a, corps);
    case 'POST inventaires/':
      return creerInventaire(a, corps);
    default:
      return undefined;
  }
}
