/**
 * Page à rouvrir après la connexion (`?suivant=`). Seul un chemin de cette application est
 * accepté : un lien du type `//site.example` ou `https://…` renverrait l'utilisateur ailleurs.
 */
export function cheminSuivant(valeur: string | null): string | null {
  if (!valeur?.startsWith('/')) return null;
  if (valeur.startsWith('//') || valeur.startsWith('/\\')) return null;
  // Revenir à la connexion après la connexion ferait tourner l'utilisateur en rond.
  if (/^\/connexion(?:[/?#]|$)/.test(valeur)) return null;
  return valeur;
}
