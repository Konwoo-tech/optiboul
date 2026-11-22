# Enregistrer un poste de confiance

Au comptoir, la connexion se fait par le nom et un code à 4 chiffres, mais seulement sur un **poste de confiance** (CdC §4.1, O1). Un poste de confiance est un navigateur qui porte le cookie `optiboul_poste`. Cette procédure enregistre le premier poste, puis les suivants (#305).

## Qui, quand, où

- **Qui** : un administrateur.
- **Quand** : à l'installation, puis à chaque nouveau PC ou navigateur du comptoir.
- **Où** : sur le PC du comptoir lui-même, dans le réseau de la boulangerie. Depuis le tunnel, l'enregistrement est refusé.

## Enregistrer le poste

1. Sur le PC du comptoir, ouvrir l'application et se connecter avec le compte administrateur : e-mail, mot de passe, puis double authentification.
2. Enregistrer le poste avec un nom parlant, par exemple « PC du comptoir » :
   - `POST /api/v1/postes/` avec le corps `{ "nom": "PC du comptoir" }` ;
   - réponse `201` : le poste créé, plus l'en-tête `Set-Cookie: optiboul_poste=…; HttpOnly; SameSite=Strict`, valable 5 ans.
3. Se déconnecter. L'écran de connexion de ce navigateur propose désormais la connexion par nom et code.

La valeur du cookie n'apparaît pas dans le corps de la réponse : elle n'est connue que du navigateur et, en empreinte, du serveur. Effacer les cookies du navigateur oblige à recommencer.

## Vérifier

- `GET /api/v1/postes/actuel/` répond `{ "poste": { "nom": "PC du comptoir", … }, "contexte": { … } }` sur le poste, et `{ "poste": null, "contexte": null }` ailleurs.
- `GET /api/v1/postes/` (administrateur) liste les postes, avec leur dernier usage.

## Révoquer un poste perdu ou remplacé

- `POST /api/v1/postes/{id}/revoquer/`, administrateur seul ; l'action est journalisée (`poste.revoque`).
- Le navigateur concerné n'est plus reconnu dès la requête suivante : la connexion par code y est refusée.

## En développement

Le proxy de Vite peut injecter le cookie : renseigner `OPTIBOUL_POSTE_COOKIE` avec la valeur reçue lors d'un enregistrement local.
