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
  'Réparation du pétrin',
  'Facture ENEO de septembre',
  'Bacs de façonnage',
  'Glacière d’Olembé',
  'Grands Moulins du Centre',
  'Mfoundi Levures & Sel',
  'Brûlés (four 2), justifié par Serge',
  'Gros court 170',
  'FAC-0198',
  'gestion/tableau-de-bord/',
  'Prime caisse juste',
  'Heures supplémentaires · sam. 10 oct.',
  'Retard au pétrissage',
  'Vendeuse au guichet',
  'Bois · 2 chargements (BC-027)',
  'Huilerie Mvog-Mbi',
  'Bois Nkolondom',
  '6 99 10 20 30',
  'gestion/fournisseurs/',
  'Caisse – équipe de nuit',
  'Support informatique',
  'Gérants de la semaine',
  'boulfaubourg',
  'support.optiboul',
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
