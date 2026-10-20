# OptiBoul : commandes de développement du monorepo (spécification technique §3).
API_COMPOSE := docker compose -f apps/api/docker-compose.local.yml
DJANGO := $(API_COMPOSE) run --rm django
WEB := pnpm --dir apps/web

.PHONY: help envs install up down logs dev migrate superuser test test-api test-web lint lint-api lint-web typecheck schema api-client certs e2e prod-build

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-14s\033[0m %s\n", $$1, $$2}'

envs: ## Crée les fichiers d'environnement locaux à partir des exemples
	@for f in apps/api/.envs/.local/.django apps/api/.envs/.local/.postgres; do \
		[ -f $$f ] || { cp $$f.example $$f; echo "créé : $$f"; }; done

up: envs ## Lance Django, PostgreSQL, Redis, Celery, Mailpit (Docker)
	$(API_COMPOSE) up -d

down: ## Arrête les services Docker
	$(API_COMPOSE) down

logs: ## Suit les journaux Docker
	$(API_COMPOSE) logs -f

install: envs ## Installe les dépendances de l'application web
	$(WEB) install

dev: ## Lance l'application web Vite sur :5173 (proxy vers Django)
	$(WEB) dev

migrate: ## Applique les migrations
	$(DJANGO) python manage.py migrate

superuser: ## Crée un super-utilisateur Django
	$(DJANGO) python manage.py createsuperuser

test: test-api test-web ## Lance tous les tests

test-api: ## Tests Django (pytest) et règles d'import (import-linter)
	$(DJANGO) pytest
	$(DJANGO) lint-imports

test-web: ## Tests de l'application web (Vitest)
	$(WEB) test

lint: lint-api lint-web ## Tous les linters

lint-api: ## Ruff, mypy
	cd apps/api && uvx ruff check . && uvx ruff format --check .
	$(DJANGO) mypy optiboul

lint-web: ## oxlint, Prettier, TypeScript
	$(WEB) lint && $(WEB) typecheck && $(WEB) format:check

typecheck: ## Vérifie les types TypeScript
	$(WEB) typecheck

schema: ## Régénère apps/api/schema.yml (OpenAPI, drf-spectacular)
	$(DJANGO) python manage.py spectacular --file schema.yml --validate

api-client: schema ## Régénère le schéma puis le client de apps/web/src/api (orval)
	$(WEB) api-client

certs: ## Certificat HTTPS local (mkcert) pour Traefik
	mkdir -p apps/api/compose/production/traefik/certs
	mkcert -cert-file apps/api/compose/production/traefik/certs/optiboul.pem \
		-key-file apps/api/compose/production/traefik/certs/optiboul-key.pem \
		optiboul.local localhost 127.0.0.1

e2e: ## Parcours Playwright sur l'environnement complet
	$(WEB) e2e

prod-build: ## Construit les images de production (api + web)
	docker compose -f docker-compose.production.yml build
