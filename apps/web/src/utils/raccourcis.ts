/** Raccourcis clavier du comptoir (parcours P3, à valider avec la boulangerie). */
export const RACCOURCIS_COMPTOIR = {
  F2: 'nouvelle-livraison',
  F4: 'encaisser',
  F8: 'bon',
  Escape: 'annuler',
} as const;

export type ActionComptoir = (typeof RACCOURCIS_COMPTOIR)[keyof typeof RACCOURCIS_COMPTOIR];
