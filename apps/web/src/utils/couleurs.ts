/** Identité visuelle (cahier des charges §8). */
export const COULEURS = {
  or: '#F2B705',
  chocolat: '#5A3220',
  creme: '#FFF4DC',
} as const;

export type SchemaCouleur = 'clair' | 'sombre';

/** Couleurs de l'interface par schéma (maquette « OptiBoul ERP v2 »). */
export const PALETTE = {
  clair: {
    fond: '#FFF4DC',
    surface: '#FFFFFF',
    ligne: '#EAD9B8',
    ligneChamp: '#E2CFA8',
    discret: '#7A5A45',
    doux: '#F3E7CF',
    horsCadre: '#E9DFCB',
    champ: '#FFFBF2',
    marque: '#5A3220',
    encre: '#2E1A10',
    barre: '#5A3220',
  },
  sombre: {
    fond: '#1E1510',
    surface: '#2A1E17',
    ligne: '#4A372A',
    ligneChamp: '#5C4535',
    discret: '#CDB59A',
    doux: '#3A2A20',
    horsCadre: '#0F0A07',
    champ: '#241A13',
    marque: '#F3D9A4',
    encre: '#F7ECDB',
    barre: '#140D09',
  },
} as const satisfies Record<SchemaCouleur, Record<string, string>>;

export type NiveauStatut = 'ok' | 'surveiller' | 'bloquant' | 'neutre';

/** Fond et texte des pastilles d'état. Le libellé reste obligatoire : jamais la couleur seule. */
export const STATUTS = {
  clair: {
    ok: { fond: '#E2F1E5', texte: '#1F6B3A' },
    surveiller: { fond: '#FCEBC5', texte: '#8A5A00' },
    bloquant: { fond: '#FBE0DC', texte: '#A2251B' },
    neutre: { fond: '#F3E7CF', texte: '#5A3220' },
  },
  sombre: {
    ok: { fond: '#1E3A27', texte: '#8FD9A8' },
    surveiller: { fond: '#4A3510', texte: '#F5C55A' },
    bloquant: { fond: '#4A1F1A', texte: '#F59A8E' },
    neutre: { fond: '#3A2A20', texte: '#F3D9A4' },
  },
} as const satisfies Record<SchemaCouleur, Record<NiveauStatut, { fond: string; texte: string }>>;

/** Pastille de l'utilisateur, par profil de l'API. */
export const AVATARS = {
  caissier: '#F2B705',
  gerant: '#E8C27A',
  production: '#D9A066',
  proprietaire: '#C98B5B',
  administrateur: '#C9B79F',
} as const;

/** Couleurs identiques en clair et en sombre. */
export const COULEURS_FIXES = {
  orSurvol: '#E3AA00',
  succes: '#2F8A4F',
  ambre: '#B07A00',
  erreur: '#C2453A',
  erreurTexte: '#A2251B',
  erreurBordure: '#D9796D',
  whatsapp: '#25D366',
} as const;
