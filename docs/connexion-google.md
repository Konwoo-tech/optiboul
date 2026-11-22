# Connexion avec Google

Le propriétaire et le gérant peuvent se connecter avec leur Gmail depuis leur téléphone (US-013, CdC §4.1). Seuls les Gmail déjà enregistrés sur un compte actif sont acceptés, et la double authentification suit toujours (#306).

## Créer l'identifiant client

1. Dans la console Google Cloud, créer un identifiant OAuth de type **Application Web**.
2. Déclarer les **origines JavaScript autorisées** :
   - en production : le nom public de l'application, par exemple `https://optiboul.exemple.cm` ;
   - en développement : l'adresse du serveur de Vite, par exemple `http://localhost:5175`.
3. Copier l'identifiant client (`….apps.googleusercontent.com`). Il est public : ce n'est pas un secret.

## Le déclarer

- **API** : variable d'environnement `OPTIBOUL_GOOGLE_CLIENT_ID`, dans `apps/api/.envs/.production/.django` (ou `.local`).
- **Front** : rien à recopier. `GET /api/v1/connexion/google/configuration/` renvoie `{ "client_id": "…", "jetons_de_test": false }`, sans connexion. Un `client_id` vide signifie que le bouton « Continuer avec Google » est masqué.

## Le parcours

1. Le front obtient un jeton d'identité de Google Identity Services.
2. Il l'envoie : `POST /api/v1/connexion/google/` avec le corps `{ "jeton": "…" }`.
3. L'API le fait vérifier par Google, puis cherche le compte actif dont c'est le Gmail. Sans compte, la réponse est `403 compte_inconnu`.
4. La double authentification suit, comme pour l'e-mail.

## Tester sans compte Google

En local seulement (`config.settings.local`, `DEBUG` actif), l'API accepte le jeton `test:<gmail>`. Par exemple, `test:willy@gmail.com` connecte le compte dont l'e-mail est `willy@gmail.com`, sans appeler Google. `configuration` renvoie alors `"jetons_de_test": true`.

Ce raccourci est refusé dès que `DEBUG` est faux : il ne peut pas servir en production.
