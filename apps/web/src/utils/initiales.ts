/**
 * Initiales d'un nom pour les pastilles, comme dans la maquette : la première lettre de chaque
 * mot (points ignorés), deux au plus. « Davy » → « D », « M. Fotso » → « MF ».
 */
export function initiales(nom: string): string {
  const lettres = nom
    .replaceAll('.', '')
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .join('');
  return lettres.slice(0, 2).toLocaleUpperCase('fr-FR');
}
