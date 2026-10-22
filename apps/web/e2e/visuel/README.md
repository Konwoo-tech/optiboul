# Contrôle visuel : prototype contre application

Le banc compare, pixel par pixel, le prototype de design (`docs/design/claude-design/OptiBoul ERP v2.dc.html`) et l'application lancée en mode simulation. Le prototype est la référence visuelle : tout écart est un défaut de l'application, sauf écart assumé et justifié par écrit.

## Lancer

Dans `apps/web` (Chromium de Playwright requis, `pnpm e2e:navigateurs` au besoin) :

```bash
pnpm e2e:visuel                      # tous les scénarios
pnpm e2e:visuel connexion-liste      # un ou plusieurs scénarios, par nom
```

Le banc démarre `vite --mode simulation` sur un port libre, joue chaque scénario dans le prototype puis dans l'application, et affiche un tableau (pixels différents, pourcentage, seuil, résultat). Le code de sortie est non nul dès qu'une zone dépasse son seuil, qu'un scénario échoue ou que les deux images n'ont pas la même taille.

Sous Windows sans `pnpm` dans le PATH : `COREPACK_ENABLE_STRICT=0 npx --yes pnpm@12.9.1 run e2e:visuel`.

## Lire les images

Elles sont écrites dans `e2e/visuel/sortie/` (ignoré par git, vidé à chaque lancement), une zone par trio :

- `<scénario>[-<zone>]-prototype.png` : la référence ;
- `<scénario>[-<zone>]-application.png` : l'application ;
- `<scénario>[-<zone>]-difference.png` : fond gris tiré du prototype, **pixels différents en rouge** ; du magenta signale une zone hors image quand les tailles diffèrent.

Un pixel est « différent » quand l'un de ses canaux R, V, B s'écarte de plus de 8 sur 255 (`ECART_PAR_CANAL` dans `outils.ts`) : cela absorbe le bruit d'anticrénelage sans masquer un changement de couleur. En cas d'écart, le tableau liste aussi les bandes de lignes et de colonnes touchées pour se repérer dans l'image. Pour regarder de près, agrandir la zone dans un visionneur d'images sans lissage.

## Ajouter un scénario

Créer ou compléter un fichier de `scenarios/`, puis l'ajouter à la liste de `scenarios/index.ts` :

```ts
export const monScenario = definirScenario({
  nom: 'comptoir-vente', // nom des images et argument de la ligne de commande
  variante: 'code', // 'code' : « Nom et code », sans double authentification ; 'email' : réglages d'origine
  viewport: { width: 1280, height: 800 }, // facultatif, 1280 x 800 par défaut
  theme: 'clair', // facultatif : 'clair' (défaut) ou 'sombre', préférence du système
  prototype: async (page, env) => {
    /* jouer côté prototype, env.urlPrototype */
  },
  application: async (page, env) => {
    /* même parcours côté application, env.urlApplication */
  },
  zones: { entete: { x: 248, y: 0, width: 1032, height: 130 } }, // facultatif : sans zone, toute la fenêtre
  seuil: 0, // pixels tolérés, 0 par défaut
  justification: '', // obligatoire si seuil > 0, sinon le scénario est refusé
});
```

Les deux fonctions s'arrêtent sur l'état à photographier ; la capture suit immédiatement. Des aides existent dans `outils.ts` : `cliquer(page, nom)` (bouton par nom accessible) et `attendrePolices(page)`.

Le prototype est piloté par ses `data-props` (mode de connexion, double authentification). Le banc n'édite jamais le fichier du dépôt : il en fait deux copies temporaires hors dépôt (une par `variante`) et les supprime à la fin.

## Ce qui est figé pour que la comparaison soit stable

- Date : `page.clock.setFixedTime` à 18 h 02 le 14 octobre 2026, fuseau `Africa/Douala`, minuteries actives.
- Thème : le prototype démarre en clair, l'application passe en sombre la nuit (O16) ; les scénarios cliquent donc « Clair » (ou « Sombre ») côté application.
- Bandeau de simulation de l'application (`[data-simulation]`) : absent du prototype, à masquer dans les scénarios qui le laissent entrer dans une zone comparée.
- Focus retiré avant la capture : le prototype focalise le champ de code trop tôt, l'application y parvient.

## Pièges appris

- Découper les textes dynamiques en nœuds séparés, comme le prototype : le crénage change à la jonction de deux nœuds.
- `position: absolute` et non `fixed` pour les toasts et les tiroirs, sinon l'anticrénelage passe en niveaux de gris.
- `font-weight: 400` explicite sur les `input` placés dans un `label` gras.
- Le prototype charge Manrope depuis Google Fonts : le banc demande un accès réseau.
- Les toasts durent 3 s : capturer juste après le geste, sans attente superflue.
- Le banc n'est pas branché sur la CI (il exige un navigateur et Google Fonts). Pour un job manuel (`workflow_dispatch`), reprendre les étapes de `.github/workflows/e2e.yml` (installation, `pnpm e2e:navigateurs`) puis `pnpm e2e:visuel` dans `apps/web`, et publier `apps/web/e2e/visuel/sortie/` avec `actions/upload-artifact`.
