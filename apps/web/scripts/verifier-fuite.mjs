// Après `pnpm build` : aucun écran ni donnée de simulation ne doit se trouver dans le paquet de
// production (`dist`). Ajouter ici un nom propre de chaque nouveau jeu de données simulé.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARQUEURS = [
  'Réouverture de la caisse du',
  'Mama Ngono',
  'Nkolondom',
  'Etoudi Château',
  'optiboul-simulation',
  'Carrefour Emana',
  'Ration de l’équipe de nuit',
];

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const dist = fileURLToPath(new URL('../dist', import.meta.url));
let fuites = 0;
for (const fichier of fichiers(dist).filter((f) => /\.(js|css|html|map)$/.test(f))) {
  const contenu = readFileSync(fichier, 'utf8');
  for (const marqueur of MARQUEURS) {
    if (contenu.includes(marqueur)) {
      console.error(`Fuite : « ${marqueur} » dans ${fichier}`);
      fuites++;
    }
  }
}
if (fuites) process.exit(1);
console.log('Aucune donnée de simulation dans dist.');
