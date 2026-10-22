export type ModeConnexion = 'email' | 'code';

export type ConfigurationSimulee = {
  /** `email` : Google ou e-mail + mot de passe ; `code` : nom puis code à 4 chiffres. */
  mode: ModeConnexion;
  /** Vérification par SMS ou WhatsApp après l'identification. */
  deuxFacteurs: boolean;
  /** Déconnexion automatique après ce nombre de minutes sans activité. */
  inactiviteMinutes: number;
};

/** Valeurs par défaut de la maquette : Google ou e-mail, double authentification, 10 minutes. */
export const CONFIGURATION_PAR_DEFAUT: ConfigurationSimulee = {
  mode: 'email',
  deuxFacteurs: true,
  inactiviteMinutes: 10,
};

/**
 * Lit la configuration dans l'adresse : `?mode=code`, `?deuxFacteurs=0`, `?inactivite=1`.
 * Ce sont les réglages de la maquette (propriétés du prototype), utiles pour parcourir chaque
 * variante de la connexion.
 */
export function lireConfiguration(recherche: string): ConfigurationSimulee {
  const parametres = new URLSearchParams(recherche);
  const minutes = Number.parseInt(parametres.get('inactivite') ?? '', 10);
  return {
    mode: parametres.get('mode') === 'code' ? 'code' : CONFIGURATION_PAR_DEFAUT.mode,
    deuxFacteurs: parametres.get('deuxFacteurs') !== '0',
    inactiviteMinutes: minutes > 0 ? minutes : CONFIGURATION_PAR_DEFAUT.inactiviteMinutes,
  };
}

/** Figée au premier appel : les redirections de l'application perdent les paramètres de l'adresse. */
let retenue: ConfigurationSimulee | undefined;

export function configurationSimulee(): ConfigurationSimulee {
  retenue ??= lireConfiguration(globalThis.location?.search ?? '');
  return retenue;
}
