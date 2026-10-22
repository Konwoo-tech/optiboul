/** Raccourcis clavier du comptoir (parcours P3, à valider avec la boulangerie). */
export const RACCOURCIS_COMPTOIR = {
  F2: 'nouvelle-livraison',
  F4: 'encaisser',
  F8: 'bon',
  Escape: 'annuler',
} as const;

export type ActionComptoir = (typeof RACCOURCIS_COMPTOIR)[keyof typeof RACCOURCIS_COMPTOIR];

/** Action du comptoir liée à une touche (`KeyboardEvent.key`), s'il y en a une. */
export function actionDeLaTouche(touche: string): ActionComptoir | undefined {
  return Object.hasOwn(RACCOURCIS_COMPTOIR, touche)
    ? RACCOURCIS_COMPTOIR[touche as keyof typeof RACCOURCIS_COMPTOIR]
    : undefined;
}
