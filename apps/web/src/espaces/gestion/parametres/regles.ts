import { formaterNombre } from '@/utils';

import type { Profil } from '../../../profils.ts';
import {
  JOURS_DE_LA_SEMAINE,
  type ErreurValeur,
  type Parametre,
  type ValeurParametre,
} from './types.ts';

/*
 * Règles des paramètres métier (cahier des charges §3.3 et §9, domaine `core/domain/parametres.py`).
 * Python pur côté serveur, ici TypeScript pur : le faux serveur et l'écran appliquent exactement
 * les mêmes contrôles.
 */

/** §3.3 : le propriétaire modifie les paramètres, l'administrateur les consulte, pas le gérant. */
export const peutConsulterParametres = (profil: Profil | null | undefined): boolean =>
  profil === 'proprietaire' || profil === 'administrateur';

export const peutModifierParametres = (profil: Profil | null | undefined): boolean =>
  profil === 'proprietaire';

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

const estJour = (valeur: unknown): valeur is string =>
  typeof valeur === 'string' && (JOURS_DE_LA_SEMAINE as readonly string[]).includes(valeur);

type Contrainte = Pick<Parametre, 'genre' | 'minimum' | 'maximum'> & { choix: readonly number[] };

export type ResultatValeur =
  { ok: true; valeur: ValeurParametre } | { ok: false; erreur: ErreurValeur };

const refus = (erreur: ErreurValeur): ResultatValeur => ({ ok: false, erreur });

/** Valide et normalise une valeur selon le genre du paramètre (mêmes règles que l'API). */
export function validerValeur(parametre: Contrainte, valeur: unknown): ResultatValeur {
  switch (parametre.genre) {
    case 'montant':
    case 'entier':
    case 'pourcentage': {
      if (typeof valeur !== 'number' || !Number.isInteger(valeur)) return refus({ code: 'entier' });
      const minimum = parametre.minimum ?? 0;
      const maximum = parametre.genre === 'pourcentage' ? 100 : parametre.maximum;
      if (valeur < minimum || (maximum !== null && valeur > maximum)) {
        return refus({ code: 'bornes', minimum, maximum });
      }
      return { ok: true, valeur };
    }
    case 'choix':
      return typeof valeur === 'number' && parametre.choix.includes(valeur)
        ? { ok: true, valeur }
        : refus({ code: 'choix', permis: parametre.choix });
    case 'heure':
      return typeof valeur === 'string' && HEURE.test(valeur)
        ? { ok: true, valeur }
        : refus({ code: 'heure' });
    case 'jour':
      return estJour(valeur) ? { ok: true, valeur } : refus({ code: 'jour' });
    case 'jours':
      if (!Array.isArray(valeur) || valeur.length === 0 || !valeur.every(estJour)) {
        return refus({ code: 'jours' });
      }
      // Ordre de la semaine, sans doublon.
      return { ok: true, valeur: JOURS_DE_LA_SEMAINE.filter((jour) => valeur.includes(jour)) };
  }
}

/** Phrase de refus du serveur (français, comme l'API). */
export function messageDeLErreur(erreur: ErreurValeur): string {
  switch (erreur.code) {
    case 'entier':
      return 'Nombre entier attendu.';
    case 'bornes':
      return `Valeur attendue entre ${erreur.minimum} et ${erreur.maximum ?? '∞'}.`;
    case 'choix':
      return `Valeur permise : ${erreur.permis.join(', ')}.`;
    case 'heure':
      return 'Heure attendue au format HH:MM.';
    case 'jour':
      return 'Jour de la semaine attendu (lundi… dimanche).';
    case 'jours':
      return 'Liste non vide de jours de la semaine attendue.';
  }
}

/** Égalité de deux valeurs (les listes de jours se comparent élément par élément). */
export function memeValeur(a: ValeurParametre, b: ValeurParametre): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((jour, rang) => jour === b[rang]);
  }
  return a === b;
}

/** « 2 000 FCFA », « 5 % », « 10:00 », « jeudi, samedi » : la valeur telle qu'on la lit. */
export function formaterValeur(
  parametre: Pick<Parametre, 'genre' | 'unite'>,
  valeur: ValeurParametre,
): string {
  if (Array.isArray(valeur)) return valeur.join(', ');
  if (typeof valeur === 'string') return valeur;
  const nombre = formaterNombre(valeur);
  if (parametre.genre === 'pourcentage') return `${nombre} %`;
  // « heures (et à chaque clôture) » : seule l'unité précède la précision.
  return parametre.unite ? `${nombre} ${parametre.unite.split(' (')[0]}` : nombre;
}

// ---------------------------------------------------------------------------
// Présentation : seuils de la maquette, groupes des autres paramètres
// ---------------------------------------------------------------------------

/** Les trois seuils de la maquette (bloc `thr`), dans son ordre. */
export const SEUILS_DE_LA_MAQUETTE = [
  'plafond_dette_client',
  'seuil_validation_depenses',
  'ecart_matiere_kg_par_sac',
] as const;

/** Familles des autres paramètres (cahier des charges §9), dans l'ordre d'affichage. */
export const GROUPES_DE_PARAMETRES = [
  {
    cle: 'dettes',
    parametres: ['echeance_dettes', 'relances_jours', 'relances_heure'],
  },
  { cle: 'caisse', parametres: ['fonds_caisse', 'plafond_especes', 'seuil_budget_surveiller'] },
  {
    cle: 'stocks',
    parametres: [
      'ecart_matiere_grammes',
      'tolerance_inventaire',
      'prix_sac_farine',
      'stock_sessions_bas',
      'stock_sessions_commande',
      'controles_stock_jours',
    ],
  },
  {
    cle: 'production',
    parametres: [
      'tolerance_validation_plan',
      'heure_limite_commandes_nuit',
      'heure_limite_commandes_jour',
      'heure_petrissage_nuit',
      'heure_petrissage_jour',
      'echeance_demande_plafond',
      'demande_estimee_sessions',
      'supplement_auto_sacs',
      'supplement_auto_pourcentage',
      'rappel_clients_habituels',
    ],
  },
  { cle: 'paie', parametres: ['jour_de_paie'] },
  {
    cle: 'securite',
    parametres: ['inactivite_comptoir', 'sauvegarde_locale', 'alerte_sauvegarde_cloud'],
  },
] as const;

export type GroupeAffiche = { cle: string; parametres: Parametre[] };

/**
 * Sépare les trois seuils de la maquette des autres paramètres, rangés par famille. Un paramètre
 * que le serveur ajouterait sans qu'on le connaisse tombe dans la famille « autres » : il reste
 * modifiable.
 */
export function repartirLesParametres(parametres: readonly Parametre[]): {
  seuils: Parametre[];
  groupes: GroupeAffiche[];
} {
  const parCle = new Map(parametres.map((p) => [p.cle, p]));
  const seuils = SEUILS_DE_LA_MAQUETTE.flatMap((cle) => parCle.get(cle) ?? []);
  const rangees = new Set<string>(SEUILS_DE_LA_MAQUETTE);
  const groupes: GroupeAffiche[] = GROUPES_DE_PARAMETRES.map((g) => ({
    cle: g.cle,
    parametres: g.parametres.flatMap((cle) => {
      rangees.add(cle);
      return parCle.get(cle) ?? [];
    }),
  }));
  const autres = parametres.filter((p) => !rangees.has(p.cle));
  if (autres.length > 0) groupes.push({ cle: 'autres', parametres: autres });
  return { seuils, groupes: groupes.filter((g) => g.parametres.length > 0) };
}

/** Le texte tapé pour une valeur numérique : l'entier tel quel, sans séparateur (maquette). */
export const saisieDe = (valeur: ValeurParametre): string => String(valeur);

/**
 * Lit une saisie numérique : des chiffres seuls (espaces ignorés), puis les bornes du paramètre.
 * Une saisie vide ou qui n'est pas un entier est refusée (`entier`).
 */
export function lireLaSaisie(parametre: Contrainte, saisie: string): ResultatValeur {
  const nette = saisie.replace(/\s/g, '');
  if (!/^\d+$/.test(nette)) return { ok: false, erreur: { code: 'entier' } };
  return validerValeur(parametre, Number(nette));
}

/** Vrai si la saisie, une fois lue, est la valeur déjà enregistrée : rien à envoyer. */
export function saisieInchangee(parametre: Parametre, saisie: string): boolean {
  const lue = lireLaSaisie(parametre, saisie);
  return lue.ok && memeValeur(lue.valeur, parametre.valeur);
}
