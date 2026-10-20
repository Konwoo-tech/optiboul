# ADR-17 · Toutes les applications sous `apps/`, regroupées par technologie

**Statut :** acceptée · 20 octobre 2026 · remplace l'arborescence de la spécification technique §3.1

## Décision

```text
apps/
├── api/        # API Django REST (Cookiecutter), anciennement backend/
└── web/        # application web React unique (voir ADR-18)
```

- Le backend s'appelle toujours **api** : dossier `apps/api`, job CI `api`, commandes `make test-api` / `make lint-api`.
- `apps/api` reste un projet Cookiecutter Django standard (ses fichiers Compose, `.envs` et sa documentation Sphinx restent à l'intérieur).
- Chaque application est autonome : `apps/api` (uv, Docker Compose) et `apps/web` (pnpm, Vite) ont chacune leurs dépendances, leurs outils et leur image Docker (ADR-20).

## Conséquences

- Un dossier par technologie : on sait immédiatement où vit le code web ou Python.
- Le schéma OpenAPI est publié dans `apps/api/schema.yml` ; le client de `apps/web/src/api` est généré depuis ce chemin.
