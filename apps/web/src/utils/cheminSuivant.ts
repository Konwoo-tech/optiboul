/**
 * Page à rouvrir après la connexion (`?suivant=`). Seul un chemin de cette application est
 * accepté : un lien du type `//site.example` ou `https://…` renverrait l'utilisateur ailleurs.
 */
export function cheminSuivant(valeur: string | null): string | null {
  if (!valeur?.startsWith('/')) return null;
  if (valeur.startsWith('//') || valeur.startsWith('/\\')) return null;
  return valeur;
}
