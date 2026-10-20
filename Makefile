# OptiBoul : commandes de développement du monorepo (spécification technique §3).
BACKEND_COMPOSE := docker compose -f backend/docker-compose.local.yml
DJANGO := $(BACKEND_COMPOSE) run --rm django

.PHONY: help envs up down logs dev migrate superuser test test-backend test-front lint lint-backend lint-front typecheck schema api-client certs prod-build

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-14s\033[0m %s\n", $$1, $$2}'

envs: ## Crée les fichiers d'environnement locaux à partir des exemples
	@for f in backend/.envs/.local/.django backend/.envs/.local/.postgres; do \
		[ -f $$f ] || { cp $$f.example $$f; echo "créé : $$f"; }; done

up: envs ## Lance Django, PostgreSQL, Redis, Celery, Mailpit (Docker)
	$(BACKEND_COMPOSE) up -d

down: ## Arrête les services Docker
	$(BACKEND_COMPOSE) down

logs: ## Suit les journaux Docker
	$(BACKEND_COMPOSE) logs -f

dev: ## Lance les 4 applications web Vite (proxy /api vers Django)
	pnpm dev

migrate: ## Applique les migrations
	$(DJANGO) python manage.py migrate

superuser: ## Crée un super-utilisateur Django
	$(DJANGO) python manage.py createsuperuser

test: test-backend test-front ## Lance tous les tests

test-backend: ## Tests Django (pytest) et règles d'import (import-linter)
	$(DJANGO) pytest
	$(DJANGO) lint-imports

test-front: ## Tests des applications et paquets (Vitest)
	pnpm test

lint: lint-backend lint-front ## Tous les linters

lint-backend: ## Ruff, mypy
	cd backend && uvx ruff check . && uvx ruff format --check .
	$(DJANGO) mypy optiboul

lint-front: ## oxlint, Prettier, TypeScript
	pnpm lint && pnpm typecheck && pnpm format:check

typecheck: ## Vérifie les types TypeScript
	pnpm typecheck

schema: ## Régénère backend/schema.yml (OpenAPI, drf-spectacular)
	$(DJANGO) python manage.py spectacular --file schema.yml --validate

api-client: schema ## Régénère le schéma puis packages/api-client (orval)
	pnpm api-client

certs: ## Certificat HTTPS local (mkcert) pour Traefik
	mkdir -p backend/compose/production/traefik/certs
	mkcert -cert-file backend/compose/production/traefik/certs/optiboul.pem \
		-key-file backend/compose/production/traefik/certs/optiboul-key.pem \
		optiboul.local localhost 127.0.0.1

prod-build: ## Construit les images de production (backend + web)
	docker compose -f docker-compose.production.yml build
