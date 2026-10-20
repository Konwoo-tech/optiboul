# ADR-17 · Toutes les applications sous `apps/`, regroupées par technologie

**Statut :** acceptée · 20 octobre 2026 · remplace l'arborescence de la spécification technique §3.1

## Décision

```text
apps/
├── api/        # API Django REST (Cookiecutter), anciennement backend/
├── web/        # application web React unique (voir ADR-18)
└── mobile/     # applications React Native : pilotage
```

- Le backend s'appelle toujours **api** : dossier `apps/api`, job CI `api`, commandes `make test-api` / `make lint-api`.
- `apps/api` reste un projet Cookiecutter Django standard (ses fichiers Compose, `.envs` et sa documentation Sphinx restent à l'intérieur).
- L'espace de travail pnpm couvre `apps/web`, `apps/mobile/*`, `packages/*` et `e2e`. `apps/api` n'est pas un paquet Node.

## Conséquences

- Un dossier par technologie : on sait immédiatement où vit le code web, mobile ou Python.
- Le schéma OpenAPI est publié dans `apps/api/schema.yml` ; `packages/api-client` le lit depuis ce chemin.
