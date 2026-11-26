import { PROFILS, type Espace, type Profil } from './profils.ts';

export type CleEcran =
  | 'session'
  | 'caisses'
  | 'clients'
  | 'depenses'
  | 'demandes'
  | 'production'
  | 'stocks'
  | 'semaines'
  | 'tableau-de-bord'
  | 'fournisseurs'
  | 'personnel'
  | 'utilisateurs'
  | 'sauvegardes'
  | 'rapports'
  | 'envois'
  | 'journal'
  | 'parametres';

export type Ecran = {
  cle: CleEcran;
  espace: Espace;
  /** Profils qui voient l'écran. Cette table ne fait que l'affichage : l'API vérifie chaque droit. */
  profils: readonly Profil[];
  /** Récit du backlog qui le livre. */
  recit?: string;
};

const DIRECTION = ['gerant', 'proprietaire'] as const;

/**
 * Écrans de chaque espace, dans l'ordre du menu (maquette « OptiBoul ERP v2 », cahier des
 * charges §3.3). La caissière retrouve clients, dépenses et demandes dans le comptoir, le
 * responsable de production ses semaines dans l'atelier ; la direction les a dans la gestion.
 */
export const ECRANS: readonly Ecran[] = [
  { cle: 'session', espace: 'comptoir', profils: ['caissier', ...DIRECTION], recit: 'US-050' },
  { cle: 'caisses', espace: 'comptoir', profils: ['caissier', ...DIRECTION], recit: 'US-040' },
  { cle: 'clients', espace: 'comptoir', profils: ['caissier'], recit: 'US-061' },
  { cle: 'depenses', espace: 'comptoir', profils: ['caissier'], recit: 'US-110' },
  { cle: 'demandes', espace: 'comptoir', profils: ['caissier'], recit: 'US-071' },

  { cle: 'production', espace: 'atelier', profils: ['production', ...DIRECTION], recit: 'US-081' },
  { cle: 'stocks', espace: 'atelier', profils: ['production', ...DIRECTION], recit: 'US-090' },
  { cle: 'semaines', espace: 'atelier', profils: ['production'], recit: 'US-030' },

  { cle: 'tableau-de-bord', espace: 'gestion', profils: DIRECTION, recit: 'US-131' },
  { cle: 'semaines', espace: 'gestion', profils: DIRECTION, recit: 'US-030' },
  { cle: 'clients', espace: 'gestion', profils: DIRECTION, recit: 'US-061' },
  { cle: 'fournisseurs', espace: 'gestion', profils: DIRECTION, recit: 'US-100' },
  { cle: 'depenses', espace: 'gestion', profils: DIRECTION, recit: 'US-110' },
  { cle: 'personnel', espace: 'gestion', profils: DIRECTION, recit: 'US-120' },
  { cle: 'demandes', espace: 'gestion', profils: DIRECTION, recit: 'US-071' },
  { cle: 'rapports', espace: 'gestion', profils: DIRECTION, recit: 'US-150' },
  { cle: 'utilisateurs', espace: 'gestion', profils: ['administrateur'], recit: 'US-020' },
  { cle: 'sauvegardes', espace: 'gestion', profils: ['administrateur'], recit: 'US-143' },
  {
    cle: 'envois',
    espace: 'gestion',
    profils: [...DIRECTION, 'administrateur'],
    recit: 'O15',
  },
  {
    cle: 'journal',
    espace: 'gestion',
    profils: [...DIRECTION, 'administrateur'],
    recit: 'US-024',
  },
  // CdC §3.3 « Paramètres métier » : propriétaire (modifie), administrateur (voit) ; pas le gérant.
  { cle: 'parametres', espace: 'gestion', profils: ['proprietaire', 'administrateur'] },
];

/** Écran d'arrivée dans un espace quand il n'est pas le premier du menu (O10). */
const ARRIVEE: Partial<Record<Profil, Partial<Record<Espace, CleEcran>>>> = {
  gerant: { gestion: 'semaines' },
};

export function ecransDe(profil: Profil | null | undefined, espace: Espace): readonly Ecran[] {
  if (!profil) return [];
  return ECRANS.filter((ecran) => ecran.espace === espace && ecran.profils.includes(profil));
}

export function cheminEcran(ecran: Pick<Ecran, 'espace' | 'cle'>): string {
  return `/${ecran.espace}/${ecran.cle}`;
}

/** Premier écran à ouvrir dans un espace pour ce profil. */
export function ecranAccueil(profil: Profil | null | undefined, espace: Espace): Ecran | undefined {
  const ecrans = ecransDe(profil, espace);
  const prevu = profil ? ARRIVEE[profil]?.[espace] : undefined;
  return ecrans.find((ecran) => ecran.cle === prevu) ?? ecrans[0];
}

/** Clé de traduction du libellé d'un écran dans le menu (maquette : « Session en cours »). */
export function cleMenu(ecran: Pick<Ecran, 'cle'>): string {
  return `menu.${ecran.cle}`;
}

/**
 * Clé de traduction du titre d'un écran. Il peut différer du libellé du menu (« Dépenses » dans le
 * menu, « Dépenses et budget » en titre), comme dans la maquette.
 */
export function cleTitre(ecran: Pick<Ecran, 'cle'>): string {
  return `titres.${ecran.cle}`;
}

/** Chemin d'arrivée après la connexion : l'écran d'accueil de l'espace d'accueil du profil. */
export function cheminAccueil(profil: Profil): string {
  const espace = PROFILS[profil].accueil.slice(1) as Espace;
  const ecran = ecranAccueil(profil, espace);
  return ecran ? cheminEcran(ecran) : PROFILS[profil].accueil;
}
