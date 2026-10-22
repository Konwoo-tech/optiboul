const CLE = 'optiboul-message-connexion';

/**
 * Message à montrer sur l'écran de connexion à la prochaine ouverture (ex. déconnexion
 * automatique). Il survit au rechargement de la page, pas à la fermeture de l'onglet.
 */
export function memoriserMessageConnexion(message: string): void {
  try {
    sessionStorage.setItem(CLE, message);
  } catch {
    // stockage indisponible : le message est simplement perdu
  }
}

export function lireMessageConnexion(): string {
  try {
    return sessionStorage.getItem(CLE) ?? '';
  } catch {
    return '';
  }
}

export function effacerMessageConnexion(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    // stockage indisponible
  }
}
