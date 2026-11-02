# Infrastructure

Installation et exploitation sur le serveur local de la boulangerie (spécification technique §10).

| Sujet                                                              | État                     | Où                                                                                               |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Certificat HTTPS local                                             | Prêt                     | `make certs` (mkcert) → `apps/api/compose/production/traefik/certs/`                             |
| Routage par préfixe, entrée distante                               | Prêt                     | `apps/api/compose/production/traefik/traefik.yml`                                                |
| Accès distant (Cloudflare Tunnel)                                  | Prêt (profil `distant`)  | `docker-compose.production.yml`, variable `CLOUDFLARE_TUNNEL_TOKEN`, cible `http://traefik:8443` ; [mise en service](../docs/acces-distant.md) |
| Sauvegarde PostgreSQL vers S3                                      | Fournie par Cookiecutter | service `awscli`, commandes `backup` / `upload` (voir `apps/api/docs`)                           |
| Script d'installation `infra/install`                              | À faire                  | US-001, US-142                                                                                   |
| Sauvegarde toutes les 4 h et à chaque clôture, restauration guidée | Prêt                     | [docs/restauration.md](../docs/restauration.md) |

## Démarrage en production

```bash
make certs                      # une fois, sur le serveur
cp apps/api/.envs/.production/.django.example   apps/api/.envs/.production/.django
cp apps/api/.envs/.production/.postgres.example apps/api/.envs/.production/.postgres
# renseigner les secrets (clé Django, Mailgun, AWS), puis :
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml run --rm django python manage.py migrate
```
