import type { Profil } from '../../../profils.ts';
import {
  MATIERES,
  type Controle,
  type FicheMatiere,
  type Inventaire,
  type LigneInventaire,
  type Matiere,
  type Mouvement,
  type TypeMouvement,
} from './types.ts';

/** Tolérance d'inventaire du cahier des charges (R9) : au-delà de 5 %, le propriétaire valide. */
export const TOLERANCE_INVENTAIRE = 5;

export type DroitsStocks = {
  /** Voir l'état du stock, les mouvements et les inventaires. */
  voir: boolean;
  /** Saisir une perte, une correction ou un inventaire (matrice des droits §3.3). */
  modifier: boolean;
};

/**
 * Le gérant et le chef de production comptent et corrigent ; le propriétaire consulte (il valide
 * les inventaires avec écart depuis l'écran des demandes).
 */
export function droitsStocks(profil: Profil | null | undefined): DroitsStocks {
  const voir = profil === 'production' || profil === 'gerant' || profil === 'proprietaire';
  return { voir, modifier: profil === 'production' || profil === 'gerant' };
}

export const arrondir = (valeur: number): number => Math.round(valeur * 100) / 100;

/** Quantité saisie : décimale avec virgule ou point. 0 si illisible ou négative. */
export function quantiteSaisie(texte: string): number {
  const valeur = Number.parseFloat(texte.replace(',', '.'));
  return Number.isFinite(valeur) && valeur > 0 ? valeur : 0;
}

/** Comptage saisi : comme une quantité, mais 0 est un comptage valable. `null` : pas encore compté. */
export function comptageSaisi(texte: string): number | null {
  if (texte.trim() === '') return null;
  const valeur = Number.parseFloat(texte.replace(',', '.'));
  return Number.isFinite(valeur) && valeur >= 0 ? valeur : null;
}

export type NiveauStock = 'suffisant' | 'a-commander' | 'bas';

/** Sessions que couvre le stock ; 99 quand la matière n'est pas consommée (maquette). */
export function sessionsRestantes(stock: number, besoin: number): number {
  return besoin ? stock / besoin : 99;
}

/** Moins d'une session : stock bas ; moins de deux : à commander. */
export function niveauDuStock(stock: number, besoin: number): NiveauStock {
  const restantes = sessionsRestantes(stock, besoin);
  if (restantes < 1) return 'bas';
  if (restantes < 2) return 'a-commander';
  return 'suffisant';
}

/** Sessions affichées, tronquées au dixième (6,66 → 6,6). */
export const sessionsAffichees = (stock: number, besoin: number): number =>
  Math.floor(sessionsRestantes(stock, besoin) * 10) / 10;

export const valeurDuStock = (matieres: readonly FicheMatiere[]): number =>
  matieres.reduce((somme, m) => somme + m.stock * m.prix, 0);

/** Effet d'un mouvement sur le stock. */
export function effet(mouvement: Pick<Mouvement, 'type' | 'quantite'>): number {
  return mouvement.type === 'entree' || mouvement.type === 'ajustement'
    ? mouvement.quantite
    : -mouvement.quantite;
}

/** Écart relatif entre le comptage et le théorique, en pour cent (0 si le théorique est nul). */
export function ecartPourcent(theorique: number, compte: number): number {
  return theorique ? ((compte - theorique) / theorique) * 100 : 0;
}

/** Un écart de plus de 5 % (strict) sur une matière envoie l'inventaire au propriétaire (R9). */
export function ecartDepasseLaTolerance(lignes: readonly LigneInventaire[]): boolean {
  return lignes.some(
    (l) =>
      l.theorique && Math.abs((l.compte - l.theorique) / l.theorique) > TOLERANCE_INVENTAIRE / 100,
  );
}

export const lignesEnEcart = (inventaire: Pick<Inventaire, 'lignes'>): LigneInventaire[] =>
  inventaire.lignes.filter((l) => l.compte !== l.theorique);

export const numeroInventaire = (numero: number): string =>
  `AUD-${String(numero).padStart(2, '0')}`;

export type ErreurMouvement = 'quantite' | 'motif';

/** Première erreur d'un mouvement manuel : la quantité, puis le motif (obligatoire, R16/US-092). */
export function erreurDeMouvement(quantite: string, motif: string): ErreurMouvement | null {
  if (!quantiteSaisie(quantite)) return 'quantite';
  if (!motif.trim()) return 'motif';
  return null;
}

export type FiltreMouvement = 'all' | TypeMouvement;

export const filtrerMouvements = (
  mouvements: readonly Mouvement[],
  filtre: FiltreMouvement,
): Mouvement[] => mouvements.filter((m) => filtre === 'all' || m.type === filtre);

/** Les huit jours du sélecteur de « Stock à date » : les sept derniers jours et aujourd'hui. */
export function joursDuSelecteur(aujourdhui: string): string[] {
  return Array.from({ length: 8 }, (_, i) => ajouterJours(aujourdhui, i - 7));
}

export function ajouterJours(iso: string, jours: number): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() + jours);
  return jour.toISOString().slice(0, 10);
}

export type LigneADate = {
  matiere: Matiere;
  fin: number;
  entrees: number;
  sorties: number;
  ajustements: number;
  /** Dernier comptage physique à cette date, s'il y en a un. */
  controle?: { inventaire: Inventaire; compte: number };
  valeur: number;
};

/**
 * Stock au soir d'un jour (cahier des charges §5.6) : à partir du dernier inventaire validé
 * jusqu'à ce jour, plus les mouvements enregistrés depuis ; sans inventaire, du stock actuel moins
 * les mouvements postérieurs. Jamais négatif.
 */
export function stockADate(
  matieres: readonly FicheMatiere[],
  mouvements: readonly Mouvement[],
  inventaires: readonly Inventaire[],
  jour: string,
  aujourdhui: string,
): { lignes: LigneADate[]; valeur: number } {
  const base = [...inventaires].reverse().find((a) => a.jour <= jour && a.statut === 'valide');
  const dernier = [...inventaires].reverse().find((a) => a.jour <= jour);
  let valeur = 0;
  const lignes = MATIERES.flatMap((cle): LigneADate[] => {
    const m = matieres.find((x) => x.cle === cle);
    if (!m) return [];
    const siens = mouvements.filter((x) => x.matiere === cle);
    const duJour = siens.filter((x) => x.jour === jour);
    const comptee = base?.lignes.find((l) => l.matiere === cle);
    let fin: number;
    if (jour === aujourdhui) {
      fin = m.stock;
    } else if (base && comptee) {
      const apres = siens
        .filter(
          (x) =>
            x.jour > base.jour &&
            x.jour <= jour &&
            !(
              x.type === 'ajustement' &&
              x.origine.genre === 'inventaire' &&
              x.origine.code === numeroInventaire(base.numero)
            ),
        )
        .reduce((somme, x) => somme + effet(x), 0);
      fin = Math.max(0, comptee.compte + apres);
    } else {
      fin = Math.max(
        0,
        m.stock - siens.filter((x) => x.jour > jour).reduce((somme, x) => somme + effet(x), 0),
      );
    }
    const ligneControle = dernier?.lignes.find((l) => l.matiere === cle);
    valeur += fin * m.prix;
    return [
      {
        matiere: cle,
        fin,
        entrees: duJour.filter((x) => x.type === 'entree').reduce((s, x) => s + x.quantite, 0),
        sorties: duJour
          .filter((x) => x.type === 'sortie' || x.type === 'perte')
          .reduce((s, x) => s + x.quantite, 0),
        ajustements: duJour
          .filter((x) => x.type === 'ajustement')
          .reduce((s, x) => s + x.quantite, 0),
        ...(dernier && ligneControle
          ? { controle: { inventaire: dernier, compte: ligneControle.compte } }
          : {}),
        valeur: fin * m.prix,
      },
    ];
  });
  return { lignes, valeur };
}

export type StatutControle = 'fait' | 'a-valider' | 'refuse' | 'manque' | 'aujourdhui' | 'prevu';

/** Statut d'un contrôle : fait (ou à valider, refusé), manqué s'il est passé, à faire aujourd'hui, prévu. */
export function statutControle(
  jour: string,
  aujourdhui: string,
  inventaire: Inventaire | undefined,
): StatutControle {
  if (inventaire) {
    return inventaire.statut === 'valide'
      ? 'fait'
      : inventaire.statut === 'a-valider'
        ? 'a-valider'
        : 'refuse';
  }
  if (jour < aujourdhui) return 'manque';
  return jour === aujourdhui ? 'aujourdhui' : 'prevu';
}

export const inventaireDuJour = (
  inventaires: readonly Inventaire[],
  jour: string,
): Inventaire | undefined => inventaires.find((a) => a.jour === jour);

/** Le contrôle à faire aujourd'hui, tant qu'aucun inventaire n'a été compté ce jour-là. */
export function controleDuJour(
  controles: readonly Controle[],
  inventaires: readonly Inventaire[],
  aujourdhui: string,
): Controle | undefined {
  return controles.find((c) => c.jour === aujourdhui && !inventaireDuJour(inventaires, c.jour));
}

export type NiveauPastille = 'ok' | 'surveiller' | 'bloquant' | 'neutre';

export const NIVEAU_MOUVEMENT: Record<TypeMouvement, NiveauPastille> = {
  entree: 'ok',
  sortie: 'neutre',
  ajustement: 'surveiller',
  perte: 'bloquant',
};

export const NIVEAU_STOCK: Record<NiveauStock, NiveauPastille> = {
  suffisant: 'ok',
  'a-commander': 'surveiller',
  bas: 'bloquant',
};

export const NIVEAU_CONTROLE: Record<StatutControle, NiveauPastille> = {
  fait: 'ok',
  'a-valider': 'surveiller',
  refuse: 'bloquant',
  manque: 'bloquant',
  aujourdhui: 'surveiller',
  prevu: 'neutre',
};

export const NIVEAU_INVENTAIRE: Record<Inventaire['statut'], NiveauPastille> = {
  valide: 'ok',
  'a-valider': 'surveiller',
  refuse: 'bloquant',
};
