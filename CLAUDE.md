# OptiBoul ERP

ERP de la Boulangerie du Faubourg (Etoudi, Yaoundé). Deux applications autonomes : `apps/api` (Django REST, Cookiecutter) et `apps/web` (React + Vite). Voir [README.md](README.md) et [docs/](docs/README.md).

## Conventions

- **Langue** : code, commentaires, documentation et interface en français ; textes de l'interface traduits FR / EN (`apps/web/src/i18n`).
- **Architecture** : les [ADR](docs/adr/README.md) font foi. En particulier ADR-17 à ADR-20 : `apps/api` + une seule application web `apps/web` à espaces selon le profil, pas d'application mobile. La spécification technique v3 décrit encore l'ancienne découpe.
- **Clean Architecture (API)** : `domain` (Python pur, sans Django) ← `application` ← `infrastructure` / `api`. Contrôlé par import-linter.
- **Contrat API** : `apps/api/schema.yml` et `apps/web/src/api/generated/` sont versionnés. Après tout changement d'API : `make api-client`.
- **Montants** en entiers FCFA, jamais en flottants. Les registres de mouvements sont en ajout seul.
- **Vérifier avant de livrer** : `make lint` et `make test`.
- **Git** : branche issue de `develop`, commits conventionnels (`feat:`, `fix:`, `docs:`…), pull request vers `develop` avec `Closes #n`. Jamais de push direct sur `main` ni `develop`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
