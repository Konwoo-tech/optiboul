export type NiveauSeuil = 'ok' | 'surveiller' | 'bloquant';

/**
 * Niveau d'une jauge selon le rapport valeur / maximum : budget d'une catégorie ou dette
 * d'un client face à son plafond. « À surveiller » dès 85 %, « bloquant » à 100 %.
 */
export function niveauDeRatio(valeur: number, maximum: number): NiveauSeuil {
  if (maximum <= 0) return valeur > 0 ? 'bloquant' : 'ok';
  const ratio = valeur / maximum;
  if (ratio >= 1) return 'bloquant';
  if (ratio >= 0.85) return 'surveiller';
  return 'ok';
}
