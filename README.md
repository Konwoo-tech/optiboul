# OptiBoul ERP

ERP de la **Boulangerie du Faubourg** (Etoudi, Yaoundé) : caisses, livraisons et dettes clients, production, stocks, fournisseurs, dépenses, paie. Le logiciel tourne sur un serveur local et le comptoir fonctionne sans internet.

Documentation fonctionnelle et technique : [`docs/`](docs/README.md). Backlog : [issues GitHub](../../issues), un jalon par sprint.

## Architecture

Monorepo unique ([spécification technique](docs/specifications/OptiBoul_ERP_Specification_technique_Architecture_v2.md), [ADR](docs/adr/README.md)) :

```text
optiboul/
├── backend/          # Cookiecutter Django : Django 6, DRF, Celery, PostgreSQL 16, Mailgun, AWS S3
│   └── optiboul/     # 12 applications par domaine × 4 couches (domain, application, infrastructure, api)
├── apps/             # applications clientes
│   ├── portail/      # /          React + Vite : connexion, accueil par profil
│   ├── comptoir/     # /comptoir  React + Vite : caisse, livraisons (clavier d'abord, sombre la nuit)
│   ├── atelier/      # /atelier   React + Vite : plan du jour, production, inventaire
│   ├── gestion/      # /gestion   React + Vite : back-office du gérant et du propriétaire
│   └── pilotage/     # mobile     React Native (Expo) : demandes, alertes, indicateurs
├── packages/         # code partagé
│   ├── api-client/   # client + hooks TanStack Query générés depuis backend/schema.yml (orval)
│   ├── auth/         # session de même origine, gardes (web)
│   ├── ui/           # thème OptiBoul Mantine, composants métier (web)
│   ├── i18n/         # FR / EN (web + mobile)
│   ├── utils/        # FCFA, créneaux jour / nuit, couleurs (web + mobile)
│   ├── testing/      # mocks MSW, setup Vitest
│   └── config/       # tsconfig, Vite
├── e2e/              # Playwright
├── compose/web/      # image Nginx des 4 applications web
├── infra/            # installation, certificats, tunnel
├── docs/             # cahier des charges, parcours, backlog, spécification, ADR
└── scripts/github/   # import du backlog en issues
```

En production, Traefik sert une seule origine : `/api`, `/accounts`, `/static`, `/django-admin…` vont à Django, le reste au conteneur web. Le tunnel d'accès distant n'expose que `/api`, pour l'application mobile.

## Démarrer

Prérequis : Docker, Node.js 24 (`.nvmrc`), pnpm 12, [uv](https://docs.astral.sh/uv/) ; Expo Go ou un émulateur pour le mobile.

```bash
pnpm install          # dépendances des applications et paquets
make up               # crée les .envs locaux puis lance Django, PostgreSQL, Redis, Celery, Mailpit
make migrate
make superuser
pnpm dev              # portail :5173, comptoir :5174, atelier :5175, gestion :5176 (proxy /api → :8000)
pnpm dev:mobile       # application Expo (EXPO_PUBLIC_API_URL dans apps/pilotage/.env)
```

| Service                      | URL                                                        |
| ---------------------------- | ---------------------------------------------------------- |
| API et documentation OpenAPI | http://localhost:8000/api/v1/docs/ (compte administrateur) |
| Mailpit (e-mails de test)    | http://localhost:8025                                      |
| Flower (Celery)              | http://localhost:5555                                      |

## Commandes

| Commande               | Effet                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `make help`            | Liste des commandes                                                                           |
| `make test`            | pytest + import-linter (backend), Vitest (front)                                              |
| `make lint`            | Ruff, mypy, oxlint, TypeScript, Prettier                                                      |
| `make api-client`      | Régénère `backend/schema.yml` puis `packages/api-client` ; à lancer à chaque changement d'API |
| `pnpm turbo run build` | Construit les applications web                                                                |
| `make prod-build`      | Images de production (backend + web)                                                          |

## Règles du dépôt

- **Clean Architecture** : `domain` (Python pur) ← `application` ← `infrastructure` / `api` ; contrôlé par import-linter.
- **Une application n'importe jamais une autre application** : le code commun va dans `packages/` (règle oxlint).
- **Contrat API** : `backend/schema.yml` et le client généré sont versionnés ; la CI échoue s'ils ne sont pas à jour.
- **Montants** en entiers FCFA, jamais en flottants ; **registres** de mouvements en ajout seul.
- Commits conventionnels (`feat:`, `fix:`, `chore:`…), une branche par récit, `Closes #n` dans la pull request.
