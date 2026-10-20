# OptiBoul ERP

ERP de la **Boulangerie du Faubourg** (Etoudi, Yaoundé) : caisses, livraisons et dettes clients, production, stocks, fournisseurs, dépenses, paie. Le logiciel tourne sur un serveur local et le comptoir fonctionne sans internet.

Documentation fonctionnelle, technique et design : [`docs/`](docs/README.md). Backlog : [tableau du projet](https://github.com/orgs/Konwoo-tech/projects/3) (kanban, sprints S1–S13) et [issues](../../issues).

## Architecture

Deux applications autonomes dans un même dépôt ([spécification technique](docs/specifications/OptiBoul_ERP_Specification_technique_Architecture_v3.md), [ADR](docs/adr/README.md)) :

```text
optiboul/
├── apps/
│   ├── api/                  # API Django REST (Cookiecutter) : Django 6, DRF, Celery, PostgreSQL 16, Mailgun, AWS S3
│   │   ├── optiboul/         # 12 applications par domaine × 4 couches (domain, application, infrastructure, api)
│   │   ├── config/           # settings, urls, celery
│   │   ├── compose/          # Dockerfiles, Traefik
│   │   └── schema.yml        # contrat OpenAPI publié
│   └── web/                  # application web unique : React + Vite + TypeScript (pnpm)
│       ├── src/
│       │   ├── profils.ts    # profil → espaces visibles et écran d'arrivée (O10)
│       │   ├── espaces/      # connexion, comptoir, atelier, gestion
│       │   ├── mise-en-page/ # en-tête, navigation, gardes
│       │   ├── api/          # client + hooks TanStack Query générés depuis apps/api/schema.yml (orval)
│       │   ├── ui/           # thème OptiBoul (Mantine), composants métier
│       │   ├── auth/         # utilisateur connecté et son profil
│       │   ├── i18n/         # FR / EN
│       │   ├── utils/        # FCFA, créneaux jour / nuit, couleurs
│       │   └── test/         # mocks MSW, setup Vitest
│       ├── e2e/              # parcours Playwright
│       ├── Dockerfile        # image Nginx de production
│       └── package.json
├── docs/
│   ├── specifications/       # cahier des charges, parcours, backlog, spécification technique
│   ├── design/               # export Claude Design (prototype cliquable, maquettes)
│   └── adr/                  # décisions d'architecture
├── infra/                    # installation, certificats, tunnel
├── scripts/github/           # import du backlog en issues
├── docker-compose.production.yml
└── Makefile
```

En production, Traefik sert une seule origine : `/api`, `/accounts`, `/static`, `/django-admin…` vont à Django, le reste à l'application web. Le tunnel d'accès distant expose l'application web et l'API au propriétaire et au gérant (jamais l'admin Django) ; l'interface s'adapte au téléphone.

## Démarrer

Prérequis : Docker, Node.js 24 (`apps/web/.nvmrc`), pnpm 12, [uv](https://docs.astral.sh/uv/).

```bash
make install          # crée les .envs locaux, installe les dépendances de apps/web
make up               # lance Django, PostgreSQL, Redis, Celery, Mailpit (Docker)
make migrate
make superuser
make dev              # application web sur http://localhost:5173 (proxy vers Django :8000)
```

| Service                      | URL                                                        |
| ---------------------------- | ---------------------------------------------------------- |
| Application web              | http://localhost:5173                                      |
| API et documentation OpenAPI | http://localhost:8000/api/v1/docs/ (compte administrateur) |
| Mailpit (e-mails de test)    | http://localhost:8025                                      |
| Flower (Celery)              | http://localhost:5555                                      |

## Commandes

| Commande          | Effet                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `make help`       | Liste des commandes                                                                         |
| `make test`       | pytest + import-linter (API), Vitest (web)                                                  |
| `make lint`       | Ruff, mypy (API) ; oxlint, TypeScript, Prettier (web)                                       |
| `make api-client` | Régénère `apps/api/schema.yml` puis `apps/web/src/api` ; à lancer à chaque changement d'API |
| `make e2e`        | Parcours Playwright sur l'environnement complet                                             |
| `make prod-build` | Images de production (api + web)                                                            |

Dans `apps/web`, les scripts pnpm habituels restent disponibles : `pnpm dev`, `pnpm test`, `pnpm build`, `pnpm lint`.

## Backlog et livraison

- Le [tableau « OptiBoul ERP · Product backlog »](https://github.com/orgs/Konwoo-tech/projects/3) regroupe les 16 épopées, les 86 récits et les pull requests, avec les colonnes Backlog → Prêt → En cours → En revue → Terminé et des sprints de deux semaines (S1 à partir du 26/10/2026).
- Après une nouvelle version du backlog dans `docs/specifications/`, deux commandes resynchronisent GitHub (simulation par défaut, `--appliquer` pour écrire) :

```bash
python3 scripts/github/importer_backlog.py   # issues, étiquettes, jalons datés
python3 scripts/github/projet_backlog.py     # tableau : champs, éléments, vues
```

## Règles du dépôt

- **Deux applications autonomes** : chacune a ses dépendances, ses outils et son image Docker ; rien de spécifique à une application à la racine.
- **Clean Architecture (API)** : `domain` (Python pur) ← `application` ← `infrastructure` / `api` ; contrôlé par import-linter.
- **Une seule application web** : ce qu'un utilisateur voit dépend de son **profil**, porté par son groupe et configuré par l'administrateur (`apps/web/src/profils.ts`, droits vérifiés par l'API).
- **Contrat API** : `apps/api/schema.yml` et le client généré sont versionnés ; la CI échoue s'ils ne sont pas à jour.
- **Montants** en entiers FCFA, jamais en flottants ; **registres** de mouvements en ajout seul.
- Commits conventionnels (`feat:`, `fix:`, `chore:`…), une branche par récit, pull request vers `develop` avec `Closes #n`.
