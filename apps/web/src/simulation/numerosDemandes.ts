/*
 * Numéros « DEM-xxx » communs à toutes les demandes de validation (plafond de la session, dépense
 * au-dessus du seuil…) : une seule suite, dans l'ordre d'émission, comme la maquette
 * « OptiBoul ERP v2 » (la demande de départ est DEM-021).
 */

/** Numéro de la demande de départ de la maquette. */
export const PREMIER_NUMERO_DEMANDE = 21;

let dernier = PREMIER_NUMERO_DEMANDE;

/** Numéro de la prochaine demande émise. */
export function prochainNumeroDemande(): number {
  dernier += 1;
  return dernier;
}

/** Repart de la demande de départ (tests). */
export function reinitialiserNumerosDemandes(): void {
  dernier = PREMIER_NUMERO_DEMANDE;
}
