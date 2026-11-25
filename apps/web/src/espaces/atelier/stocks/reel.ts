import {
  controlesStockList,
  mouvementsStockEtatList,
  receptionsPlanifieesList,
  semainesList,
  type ControleStock,
  type ReceptionPlanifiee as ReceptionServeur,
  type Semaine,
  mouvementsStockList,
  toutesLesPages,
  type LigneEtat,
  type MouvementStock,
} from '@/api';

import type { Creneau } from '@/utils';

import {
  MATIERES,
  type Controle,
  type FicheMatiere,
  type InstantaneStocks,
  type Inventaire,
  type StatutInventaire,
  type Matiere,
  type Mouvement,
  type OrigineMouvement,
  type ReceptionPlanifiee,
  type TypeMouvement,
} from './types.ts';

/*
 * Lecture de « Atelier › Stocks » sur le vrai serveur : `mouvements-stock/etat/` (stock, besoin,
 * valeur, prochaine réception) et `mouvements-stock/` (tous les mouvements). Les inventaires et les
 * réceptions planifiées complètes viennent à l'étape suivante (#279).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

const estMatiere = (code: string): code is Matiere =>
  (MATIERES as readonly string[]).includes(code);

const numero = (id: number, prefixe: string) => `${prefixe}-${String(id).padStart(4, '0')}`;

/** D'où vient un mouvement du serveur : achat, réception, production, inventaire ou saisie à la main. */
export function origineDuMouvement(m: MouvementStock): OrigineMouvement {
  switch (m.genre) {
    case 'achat':
      return m.motif === 'Marché'
        ? { genre: 'depense', code: numero(m.source_id, 'DEP'), achat: 'marche' }
        : {
            genre: 'depense',
            code: numero(m.source_id, 'DEP'),
            achat: 'fournisseur',
            fournisseur: m.motif,
          };
    case 'reception':
      return {
        genre: 'reception',
        code: `BC-${m.source_id}`,
        fournisseur: m.motif,
        partielle: false,
      };
    case 'production':
      return {
        genre: 'production',
        creneau: (/nuit/i.test(m.motif) ? 'nuit' : 'jour') as Creneau,
        date: jourDeYaounde(m.cree_le),
      };
    case 'inventaire':
      return {
        genre: 'inventaire',
        code: `AUD-${m.source_id}`,
        date: jourDeYaounde(m.cree_le),
      };
    default:
      return { genre: 'manuel', motif: m.motif };
  }
}

/** Un mouvement du serveur ; `undefined` pour une matière que l'écran ne suit pas (l'eau). */
export function versMouvement(m: MouvementStock): Mouvement | undefined {
  if (!estMatiere(m.matiere)) return undefined;
  const sens = Number(m.sens);
  const valeur = Number(m.quantite);
  let type: TypeMouvement;
  if (m.genre === 'achat' || m.genre === 'reception') type = 'entree';
  else if (m.genre === 'production') type = 'sortie';
  else if (m.genre === 'perte') type = 'perte';
  else if (m.genre === 'correction' && sens > 0) type = 'entree';
  else type = 'ajustement';
  return {
    id: String(m.id),
    jour: jourDeYaounde(m.cree_le),
    heure: heureDeYaounde(m.cree_le),
    type,
    matiere: m.matiere,
    // Seul l'ajustement est signé.
    quantite: type === 'ajustement' ? sens * valeur : valeur,
    origine: origineDuMouvement(m),
    par: m.auteur,
  };
}

/** Fiche d'une matière : stock, besoin par session et prix unitaire déduit de la valeur du stock. */
export function versFiche(ligne: LigneEtat): FicheMatiere | undefined {
  if (!estMatiere(ligne.matiere)) return undefined;
  const stock = Number(ligne.quantite);
  return {
    cle: ligne.matiere,
    stock,
    besoin: Number(ligne.besoin_par_session),
    prix: stock > 0 ? ligne.valeur / stock : 0,
  };
}

/** Prochaine réception annoncée par l'état du stock, si le serveur en donne une. */
export function versReception(ligne: LigneEtat): ReceptionPlanifiee | undefined {
  const prochaine = ligne.prochaine_reception as { jour?: string; quantite?: string } | null;
  if (!estMatiere(ligne.matiere) || !prochaine?.jour) return undefined;
  return {
    matiere: ligne.matiere,
    jour: prochaine.jour,
    quantite: Number(prochaine.quantite ?? 0),
  };
}

/** Matières que compte un contrôle de semaine (R16) : les clés en semaine, toutes le dimanche. */
export const MATIERES_CLES: readonly Matiere[] = ['farine', 'levure', 'ameliorant'];

const estUnDimanche = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay() === 0;

/** Un contrôle de la semaine, avec le gérant et le responsable de production de sa semaine. */
export function versControle(controle: ControleStock, semaines: readonly Semaine[]): Controle {
  const semaine = semaines.find((s) => s.id === controle.semaine);
  return {
    semaine: semaine?.numero ?? controle.semaine,
    jour: controle.jour,
    moment: estUnDimanche(controle.jour) ? 'dimanche' : 'mercredi',
    gerant: semaine?.gerant?.nom ?? '',
    responsableProduction: semaine?.production?.nom ?? '',
  };
}

/** Un contrôle fait devient un inventaire : à valider si un écart dépasse la tolérance (R9). */
export function versInventaire(controle: ControleStock): Inventaire | undefined {
  if (!controle.fait_le) return undefined;
  const lignes = controle.lignes.filter((l) => estMatiere(l.matiere));
  const statuts = lignes.map((l) => l.statut);
  let statut: StatutInventaire = 'valide';
  if (statuts.includes('soumise')) statut = 'a-valider';
  else if (statuts.length > 0 && statuts.every((s) => s === 'refusee')) statut = 'refuse';
  return {
    id: String(controle.id),
    numero: controle.id,
    jour: jourDeYaounde(controle.fait_le),
    heure: heureDeYaounde(controle.fait_le),
    // Le serveur ne dit pas qui a compté.
    par: '',
    statut,
    validePar: '',
    lignes: lignes.map((l) => ({
      matiere: l.matiere as Matiere,
      theorique: Number(l.theorique),
      compte: Number(l.compte),
    })),
  };
}

/** Réception planifiée encore attendue, la plus proche d'abord. */
export function versReceptions(receptions: readonly ReceptionServeur[]): ReceptionPlanifiee[] {
  return receptions
    .filter((r) => r.statut === 'planifiee' && estMatiere(r.matiere))
    .sort((a, b) => a.prevue_le.localeCompare(b.prevue_le))
    .map((r) => ({
      matiere: r.matiere as Matiere,
      jour: r.prevue_le,
      quantite: Number(r.quantite),
    }));
}

/** Compose l'instantané de l'écran des stocks à partir des routes du serveur. */
export async function lireStocksReels(): Promise<InstantaneStocks> {
  const [etat, mouvements, controles, semaines, planifiees] = await Promise.all([
    // L'état du stock est une liste simple (une ligne par matière), sans pagination.
    mouvementsStockEtatList().then((r) => r.data as unknown as LigneEtat[]),
    toutesLesPages<MouvementStock>(
      (page) => mouvementsStockList({ page }) as Promise<Page<MouvementStock>>,
    ),
    toutesLesPages<ControleStock>(
      (page) => controlesStockList({ page }) as Promise<Page<ControleStock>>,
    ).catch(() => [] as ControleStock[]),
    toutesLesPages<Semaine>((page) => semainesList({ page }) as Promise<Page<Semaine>>).catch(
      () => [] as Semaine[],
    ),
    toutesLesPages<ReceptionServeur>(
      (page) => receptionsPlanifieesList({ page }) as Promise<Page<ReceptionServeur>>,
    ).catch(() => [] as ReceptionServeur[]),
  ]);
  const aujourdhui = jourDeYaounde(new Date().toISOString());
  const duJour = controles.find((c) => c.jour === aujourdhui && !c.fait_le);
  return {
    aujourdhui,
    // Le serveur ne dit pas sur combien de sacs il calcule le besoin : l'écran n'affiche pas ce chiffre.
    matieres: etat.map(versFiche).filter((f): f is FicheMatiere => f !== undefined),
    // Les réceptions planifiées ; à défaut, la prochaine annoncée par l'état du stock.
    receptions: planifiees.length
      ? versReceptions(planifiees)
      : etat.map(versReception).filter((r): r is ReceptionPlanifiee => r !== undefined),
    mouvements: mouvements
      .map(versMouvement)
      .filter((m): m is Mouvement => m !== undefined)
      .sort((a, b) => Number(b.id) - Number(a.id)),
    inventaires: controles
      .map(versInventaire)
      .filter((i): i is Inventaire => i !== undefined)
      .sort((a, b) => a.numero - b.numero),
    controles: controles
      .map((c) => versControle(c, semaines))
      .sort((a, b) => a.jour.localeCompare(b.jour)),
    ...(duJour
      ? {
          controleDuJourId: String(duJour.id),
          matieresACompter:
            duJour.portee === 'cles'
              ? MATIERES_CLES.slice()
              : (MATIERES as readonly Matiere[]).slice(),
        }
      : {}),
  };
}
