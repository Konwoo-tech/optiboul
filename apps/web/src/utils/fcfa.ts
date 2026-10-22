/**
 * Entier avec espace insécable des milliers et signe moins explicite (U+2212), comme la maquette.
 * Ex. 20000 → « 20 000 », -1500 → « −1 500 ». Sans unité : pour « 1 250 / 2 000 FCFA ».
 */
export function formaterNombre(montant: number): string {
  const entier = Math.round(montant);
  const absolu = Math.abs(entier)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${entier < 0 ? '−' : ''}${absolu}`;
}

/**
 * Montant en FCFA : sans décimale, espace des milliers, signe moins explicite.
 * Ex. 20000 → « 20 000 FCFA », -1500 → « −1 500 FCFA ».
 */
export function formatFCFA(montant: number): string {
  return `${formaterNombre(montant)} FCFA`;
}

/** Comme `formaterNombre`, avec « + » devant un montant positif (écarts). Ex. 500 → « +500 ». */
export function formaterNombreSigne(montant: number): string {
  return `${montant > 0 ? '+' : ''}${formaterNombre(montant)}`;
}
