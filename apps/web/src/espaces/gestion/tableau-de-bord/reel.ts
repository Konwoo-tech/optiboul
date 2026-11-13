import {
  alertesList,
  clientsDettesRetrieve,
  semainesList,
  tableauDeBordRetrieve,
  toutesLesPages,
  type Semaine,
} from '@/api';

import type { CleEcran } from '../../../navigation.ts';
import { versCategorie } from '../../comptoir/depenses/reel.ts';
import type { Espace } from '../../../profils.ts';
import type {
  Alerte,
  InstantaneTableauDeBord,
  NiveauAlerte,
  ProductionDuProduit,
  RecetteDeNuit,
} from './types.ts';

/*
 * Lecture du « Tableau de bord » sur le vrai serveur : `tableau-de-bord/` (indicateurs et
 * graphiques du mois), `alertes/` (titre, détail et lien déjà rédigés par le serveur), les dettes des
 * clients et la semaine ouverte.
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

type AlerteServeur = {
  type: string;
  niveau: string;
  titre: string;
  detail: string;
  nombre: number;
  lien: string;
};
type TableauServeur = {
  mois: string;
  indicateurs: {
    recette: number;
    ventes: number;
    dettes_clients: number;
    dettes_fournisseurs: number;
    marge_estimee: { matieres: number; charges: number; marge: number };
  };
  graphiques: {
    budget_par_categorie?: { categorie: string; budget: number; depense: number }[];
    recette_par_session: { jour: string; creneau: string; recette: number }[];
    production_par_produit: { produit?: string; code?: string; pains?: number; total?: number }[];
  };
};

const ESPACES: readonly string[] = ['comptoir', 'atelier', 'gestion', 'administration'];

/** Écran qu'une alerte ouvre, d'après le lien du serveur (« /gestion/clients?statut=plafond_depasse »). */
export function destinationDuLien(lien: string): Alerte['destination'] {
  const [chemin, recherche] = lien.split('?');
  const [espace, ecran] = (chemin ?? '').split('/').filter(Boolean);
  return {
    espace: (ESPACES.includes(espace ?? '') ? espace : 'gestion') as Espace,
    ecran: (ecran ?? 'tableau-de-bord') as CleEcran,
    ...(recherche ? { parametres: Object.fromEntries(new URLSearchParams(recherche)) } : {}),
  };
}

export function versAlerte(a: AlerteServeur, rang: number): Alerte {
  return {
    id: `${a.type}-${rang}`,
    niveau: (a.niveau === 'bloquant' ? 'bloquant' : 'surveiller') as NiveauAlerte,
    destination: destinationDuLien(a.lien),
    type: 'serveur',
    titre: a.titre,
    detail: a.detail,
    nombre: a.nombre,
  };
}

/** Pains produits depuis le début du mois, par produit (« GC135 » s'affiche « GC 135 »). */
export function versProduction(
  lignes: TableauServeur['graphiques']['production_par_produit'],
): ProductionDuProduit[] {
  return lignes.map((l) => ({
    produit: (l.produit ?? l.code ?? '').replace(/^([A-Za-z]+)(\d+)$/, '$1 $2'),
    pains: l.pains ?? l.total ?? 0,
  }));
}

export function versRecettes(
  lignes: TableauServeur['graphiques']['recette_par_session'],
): RecetteDeNuit[] {
  return lignes.map((l) => ({ jour: l.jour, montant: l.recette }));
}

/** Compose l'instantané du tableau de bord à partir des routes du serveur. */
export async function lireTableauDeBordReel(): Promise<InstantaneTableauDeBord> {
  const [tableau, alertes, dettes, semaines] = await Promise.all([
    tableauDeBordRetrieve().then((r) => r.data as unknown as TableauServeur),
    alertesList()
      .then((r) => r.data as unknown as AlerteServeur[])
      .catch(() => [] as AlerteServeur[]),
    clientsDettesRetrieve()
      .then((r) => r.data as unknown as { nombre: number; total: number })
      .catch(() => null),
    toutesLesPages<Semaine>((page) => semainesList({ page }) as Promise<Page<Semaine>>).catch(
      () => [] as Semaine[],
    ),
  ]);
  const ouverte = semaines.find((s) => s.statut === 'ouverte') ?? semaines.at(-1);
  const nombre = (type: string) => alertes.find((a) => a.type === type)?.nombre ?? 0;
  const { indicateurs, graphiques } = tableau;
  return {
    mois: tableau.mois,
    recette: { encaissee: indicateurs.recette, due: indicateurs.ventes },
    dettesClients: {
      montant: indicateurs.dettes_clients,
      clients: dettes?.nombre ?? 0,
      auDessusDuPlafond: nombre('plafonds_depasses'),
    },
    dettesFournisseurs: {
      montant: indicateurs.dettes_fournisseurs,
      facturesEnRetard: nombre('factures_en_retard'),
    },
    semaine: {
      numero: ouverte?.numero ?? 0,
      du: ouverte?.du ?? '',
      au: ouverte?.au ?? '',
      gerant: ouverte?.gerant?.nom ?? '',
      production: ouverte?.production?.nom ?? '',
    },
    recettesParNuit: versRecettes(graphiques.recette_par_session),
    production: versProduction(graphiques.production_par_produit),
    // Le serveur range ses alertes des plus urgentes aux moins urgentes.
    alertes: alertes.map(versAlerte),
    marge: indicateurs.marge_estimee,
    budget: (graphiques.budget_par_categorie ?? []).map((l) => ({
      categorie: versCategorie(l.categorie),
      budget: l.budget,
      realise: l.depense,
    })),
  };
}
