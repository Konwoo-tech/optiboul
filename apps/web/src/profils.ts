import type { ProfilEnum } from '@/api';

export type Profil = ProfilEnum;
export type Espace = 'comptoir' | 'atelier' | 'gestion';

type Configuration = {
  /** Écran d'arrivée après la connexion (O10). */
  accueil: `/${Espace}`;
  /** Espaces visibles dans la navigation, dans l'ordre. */
  espaces: readonly Espace[];
};

/**
 * Ce que chaque profil voit dans l'application (cahier des charges §3.3, parcours UX §5.3).
 * Le profil vient du groupe de l'utilisateur, configuré par l'administrateur.
 * Cette table ne fait que l'affichage : chaque droit est vérifié par l'API.
 */
export const PROFILS: Record<Profil, Configuration> = {
  caissier: { accueil: '/comptoir', espaces: ['comptoir'] },
  production: { accueil: '/atelier', espaces: ['atelier'] },
  gerant: { accueil: '/gestion', espaces: ['gestion', 'comptoir', 'atelier'] },
  proprietaire: { accueil: '/gestion', espaces: ['gestion', 'comptoir', 'atelier'] },
  administrateur: { accueil: '/gestion', espaces: ['gestion'] },
};

export function espacesDe(profil: Profil | null | undefined): readonly Espace[] {
  return profil ? PROFILS[profil].espaces : [];
}

export function peutOuvrir(profil: Profil | null | undefined, espace: Espace): boolean {
  return espacesDe(profil).includes(espace);
}
