import { ECRANS, cheminEcran, type CleEcran } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';

/**
 * Adresse d'un écran pour ce profil, avec ses réglages dans l'adresse ; `null` quand le profil ne
 * voit pas cet écran (le responsable de production n'a ni les caisses, ni les clients, ni les
 * dépenses : le lien reste affiché, comme dans la maquette, mais ne mène nulle part).
 */
export function lienVers(
  profil: Profil | null | undefined,
  cle: CleEcran,
  reglages: Record<string, string> = {},
): string | null {
  const ecran = profil ? ECRANS.find((e) => e.cle === cle && e.profils.includes(profil)) : null;
  if (!ecran) return null;
  const adresse = new URLSearchParams(reglages).toString();
  return `${cheminEcran(ecran)}${adresse ? `?${adresse}` : ''}`;
}
