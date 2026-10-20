# ADR-20 · Application web autonome

**Statut :** acceptée · 20 octobre 2026 · remplace ADR-12 (pnpm + Turborepo, paquets partagés)

## Contexte

Avec une seule application web (ADR-18) et sans application mobile (ADR-19), l'espace de travail pnpm, Turborepo et les sept paquets de `packages/` n'avaient plus qu'un seul consommateur. Les `node_modules`, le lockfile et les outils JavaScript encombraient la racine du dépôt.

## Décision

- **`apps/web` est un projet autonome**, comme `apps/api` : `package.json`, `pnpm-lock.yaml`, `node_modules`, configuration Vite, TypeScript, oxlint, Prettier, tests Playwright (`e2e/`), `Dockerfile` et `nginx.conf` y vivent.
- Les anciens paquets deviennent des dossiers de `apps/web/src/`, importés avec l'alias `@/` :

| Ancien paquet          | Dossier                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `@optiboul/api-client` | `src/api` (client généré par orval depuis `apps/api/schema.yml`) |
| `@optiboul/auth`       | `src/auth`                                                       |
| `@optiboul/ui`         | `src/ui`                                                         |
| `@optiboul/i18n`       | `src/i18n`                                                       |
| `@optiboul/utils`      | `src/utils`                                                      |
| `@optiboul/testing`    | `src/test`                                                       |
| `@optiboul/config`     | `vite.config.ts`, `tsconfig.json`                                |

- **La racine ne contient que ce qui est commun** : `docs/`, `infra/`, `scripts/`, `.github/`, `Makefile`, `docker-compose.production.yml`, `.pre-commit-config.yaml`.
- La CI garde un job par application (`api`, `web`), déclenché seulement quand l'application change.

## Conséquences

- On ouvre `apps/web` et on y trouve tout le web ; `pnpm install` se lance dans ce dossier (ou `make install`).
- La règle « le code commun va dans `packages/` » disparaît. Si un second client apparaît un jour, on extraira un paquet à ce moment-là.
