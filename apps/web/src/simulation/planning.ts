import { joursDeLaSemaine } from '@/espaces/gestion/semaines/regles.ts';
import type {
  AffectationJour,
  Creneau,
  Passage,
  Personne,
  Planning,
  RoleAffecte,
  Semaine,
} from '@/espaces/gestion/semaines/types.ts';

import { COMPTES_SIMULES, type ContexteSimule } from './donnees.ts';

/*
 * Semaines de travail et planning des caisses : état de la maquette « OptiBoul ERP v2 »
 * (`weeks`, `planning`). C'est la seule source des semaines, de leurs affectations et de la
 * caissière prévue sur chaque créneau : le faux serveur des caisses (`caisses.ts`), le contexte
 * de la coque et l'écran Gestion › Semaines (`semaines.ts`) la lisent ici. Sans autre import
 * que les comptes : ce module ne peut pas former de cycle.
 */

type Etat = { semaines: Semaine[]; planning: Planning };

export function personne(id: string): Personne | null {
  const compte = COMPTES_SIMULES.find((c) => c.id === id);
  return compte ? { id: compte.id, nom: compte.nom, profil: compte.profil } : null;
}

const semaine = (
  numero: number,
  du: string,
  au: string,
  statut: Semaine['statut'],
  gerant: string,
  production: string,
  planifieePar: string,
  ouverture: Passage | null,
  cloture: Passage | null,
): Semaine => ({
  id: `S${numero}`,
  numero,
  du,
  au,
  statut,
  gerant: personne(gerant),
  production: personne(production),
  planifieePar,
  ouverture,
  cloture,
});

/** Semaines 41 (clôturée), 42 (ouverte), 43 et 44 (planifiées), comme la maquette. */
const SEMAINES_DE_DEPART = (): Semaine[] => [
  semaine(
    41,
    '2026-10-05',
    '2026-10-11',
    'cloturee',
    'patrick',
    'serge',
    'M. Fotso',
    { par: 'M. Fotso', jour: '2026-10-05', heure: '05:50' },
    { par: 'Patrick', jour: '2026-10-11', heure: '21:40' },
  ),
  semaine(
    42,
    '2026-10-12',
    '2026-10-18',
    'ouverte',
    'willy',
    'serge',
    'M. Fotso',
    { par: 'M. Fotso', jour: '2026-10-12', heure: '05:55' },
    null,
  ),
  semaine(43, '2026-10-19', '2026-10-25', 'planifiee', 'patrick', 'ignace', 'M. Fotso', null, null),
  semaine(44, '2026-10-26', '2026-11-01', 'planifiee', '', '', '', null, null),
];

/**
 * Rachel le jour, Davy la nuit pour les semaines 41 à 43, sauf la nuit du 25 octobre qui n'est
 * pas affectée ; rien n'est planifié pour la semaine 44.
 */
function planningDeDepart(semaines: readonly Semaine[]): Planning {
  const planning: Planning = {};
  for (const s of semaines) {
    planning[s.id] = {};
    joursDeLaSemaine(s.du).forEach((jour) => {
      const vide = s.numero === 44 || jour === '2026-10-25';
      planning[s.id]![jour] = { jour: s.numero === 44 ? '' : 'rachel', nuit: vide ? '' : 'davy' };
    });
  }
  return planning;
}

const etatInitial = (): Etat => {
  const semaines = SEMAINES_DE_DEPART();
  return { semaines, planning: planningDeDepart(semaines) };
};

let courant: Etat | undefined;
const lireEtat = (): Etat => (courant ??= etatInitial());

/** Remet les semaines et le planning à leur état de départ (tests). */
export function reinitialiserPlanning(): void {
  courant = undefined;
}

export const lireSemaines = (): Semaine[] => structuredClone(lireEtat().semaines);
export const lirePlanning = (): Planning => structuredClone(lireEtat().planning);

/** Semaine ouverte, sinon dernière clôturée, sinon la première (maquette : `curWeek`). */
export function semaineCouranteSimulee(): Semaine {
  const { semaines } = lireEtat();
  return (
    semaines.find((s) => s.statut === 'ouverte') ??
    [...semaines].reverse().find((s) => s.statut === 'cloturee') ??
    semaines[0]!
  );
}

/** Semaine qui contient le jour donné ; la semaine courante à défaut (maquette : `weekOfDay`). */
export function semaineDuJourSimulee(jour: string): Semaine {
  return lireEtat().semaines.find((s) => jour >= s.du && jour <= s.au) ?? semaineCouranteSimulee();
}

/** Identifiant de la caissière prévue sur un créneau ; vide : personne n'est affecté. */
export function caissierePrevue(jour: string, type: Creneau): string {
  const s = lireEtat().semaines.find((x) => jour >= x.du && jour <= x.au);
  return (s && lireEtat().planning[s.id]?.[jour]?.[type]) || '';
}

/** Ce que la coque affiche de la semaine en cours : elle suit les ouvertures et clôtures. */
export function contexteSemaines(): Pick<
  ContexteSimule,
  'semaine' | 'gerantDeLaSemaine' | 'responsableProduction'
> {
  const s = semaineCouranteSimulee();
  return {
    semaine: { numero: s.numero, du: s.du, au: s.au },
    gerantDeLaSemaine: s.gerant?.nom ?? '—',
    responsableProduction: s.production?.nom ?? '—',
  };
}

const trouver = (id: string) => lireEtat().semaines.find((s) => s.id === id);

export function affecter(id: string, role: RoleAffecte, personneId: string): Semaine | undefined {
  const s = trouver(id);
  if (!s) return undefined;
  const choisie = personneId ? personne(personneId) : null;
  if (role === 'gerant') s.gerant = choisie;
  else s.production = choisie;
  return structuredClone(s);
}

export function planifierCreneau(
  id: string,
  jour: string,
  creneau: Creneau,
  caissiere: string,
): void {
  const jours = lireEtat().planning[id] ?? (lireEtat().planning[id] = {});
  const affectation: AffectationJour = jours[jour] ?? (jours[jour] = { jour: '', nuit: '' });
  affectation[creneau] = caissiere;
}

export function marquerPlanifiee(id: string, par: string): void {
  const s = trouver(id);
  if (s) s.planifieePar = par;
}

export function ouvrirSemaine(id: string, passage: Passage): void {
  const s = trouver(id);
  if (s) {
    s.statut = 'ouverte';
    s.ouverture = passage;
  }
}

export function cloturerSemaine(id: string, passage: Passage): void {
  const s = trouver(id);
  if (s) {
    s.statut = 'cloturee';
    s.cloture = passage;
  }
}
