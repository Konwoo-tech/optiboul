const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/**
 * Montant en FCFA : sans décimale, espace des milliers, signe moins explicite.
 * Ex. 20000 → « 20 000 FCFA », -1500 → « −1 500 FCFA ».
 */
export function formatFCFA(montant: number): string {
  const absolu = nombre.format(Math.abs(Math.round(montant)));
  return `${montant < 0 ? '−' : ''}${absolu} FCFA`;
}
