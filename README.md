# OptiBoul ERP

ERP de la **Boulangerie du Faubourg** (Etoudi, Yaoundé) : caisses, livraisons et dettes clients, production, stocks, fournisseurs, dépenses, paie. Le logiciel tourne sur un serveur local et le comptoir fonctionne sans internet.

Documentation fonctionnelle, technique et design : [`docs/`](docs/README.md). Backlog : [issues GitHub](../../issues), un jalon par sprint.

## Architecture

Monorepo unique ([spécification technique](docs/specifications/OptiBoul_ERP_Specification_technique_Architecture_v2.md), [ADR](docs/adr/README.md)) :

```text
optiboul/
├── apps/
│   ├── api/              # API Django REST (Cookiecutter) : Django 6, DRF, Celery, PostgreSQL 16, Mailgun, AWS S3
│   │   └── optiboul/     # 12 applications par domaine × 4 couches (domain, application, infrastructure, api)
│   └── web/              # application web unique React + Vite + TypeScript
│       └── src/
│           ├── profils.ts    # profil → espaces visibles et écran d'arrivée (O10)
│           └── espaces/      # connexion, comptoir, atelier, gestion
├── packages/             # code partagé (paquets internes)
│   ├── api-client/       # client + hooks TanStack Query générés depuis apps/api/schema.yml (orval)
│   ├── auth/             # session de même origine, gardes (web)
│   ├── ui/               # thème OptiBoul Mantine, composants métier (web)
│   ├── i18n/             # FR / EN
│   ├── utils/            # FCFA, créneaux jour / nuit, couleurs
│   ├── testing/          # mocks MSW, setup Vitest
│   └── config/           # tsconfig, Vite
├── e2e/                  # Playwright
├── compose/web/          # image Nginx de l'application web
├── infra/                # installation, certificats, tunnel
├── docs/
│   ├── specifications/   # cahier des charges, parcours, backlog, spécification technique
│   ├── design/           # export Claude Design (prototype cliquable, maquettes)
│   └── adr/              # décisions d'architecture
└── scripts/github/       # import du backlog en issues
```

En production, Traefik sert une seule origine : `/api`, `/accounts`, `/static`, `/django-admin…` vont à Django, le reste à l'application web. Le tunnel d'accès distant expose l'application web et l'API au propriétaire et au gérant (jamais l'admin Django) ; l'interface s'adapte au téléphone.

## Démarrer

Prérequis : Docker, Node.js 24 (`.nvmrc`), pnpm 12, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install          # dépendances des applications et paquets
make up               # crée les .envs locaux puis lance Django, PostgreSQL, Redis, Celery, Mailpit
make migrate
make superuser
pnpm dev              # application web sur http://localhost:5173 (proxy vers Django :8000)
```

| Service                      | URL                                                        |
| ---------------------------- | ---------------------------------------------------------- |
| API et documentation OpenAPI | http://localhost:8000/api/v1/docs/ (compte administrateur) |
| Mailpit (e-mails de test)    | http://localhost:8025                                      |
| Flower (Celery)              | http://localhost:5555                                      |

## Commandes

| Commande               | Effet                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `make help`            | Liste des commandes                                                                            |
| `make test`            | pytest + import-linter (API), Vitest (web et paquets)                                          |
| `make lint`            | Ruff, mypy, oxlint, TypeScript, Prettier                                                       |
| `make api-client`      | Régénère `apps/api/schema.yml` puis `packages/api-client` ; à lancer à chaque changement d'API |
| `pnpm turbo run build` | Construit les applications web                                                                 |
| `make prod-build`      | Images de production (api + web)                                                               |

## Règles du dépôt

- **Clean Architecture** : `domain` (Python pur) ← `application` ← `infrastructure` / `api` ; contrôlé par import-linter.
- **Une seule application web** : ce qu'un utilisateur voit dépend de son **profil**, porté par son groupe et configuré par l'administrateur (`apps/web/src/profils.ts`, droits vérifiés par l'API).
- **Une application n'importe jamais une autre application** : le code commun va dans `packages/` (règle oxlint).
- **Contrat API** : `apps/api/schema.yml` et le client généré sont versionnés ; la CI échoue s'ils ne sont pas à jour.
- **Montants** en entiers FCFA, jamais en flottants ; **registres** de mouvements en ajout seul.
- Commits conventionnels (`feat:`, `fix:`, `chore:`…), une branche par récit, `Closes #n` dans la pull request.
