# Infrastructure

Installation et exploitation sur le serveur local de la boulangerie (spécification technique §10).

| Sujet                                                              | État                     | Où                                                                                               |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Certificat HTTPS local                                             | Prêt                     | `make certs` (mkcert) → `backend/compose/production/traefik/certs/`                              |
| Routage par préfixe, entrée distante                               | Prêt                     | `backend/compose/production/traefik/traefik.yml`                                                 |
| Accès distant (Cloudflare Tunnel)                                  | Prêt (profil `distant`)  | `docker-compose.production.yml`, variable `CLOUDFLARE_TUNNEL_TOKEN`, cible `http://traefik:8443` |
| Sauvegarde PostgreSQL vers S3                                      | Fournie par Cookiecutter | service `awscli`, commandes `backup` / `upload` (voir `backend/docs`)                            |
| Script d'installation `infra/install`                              | À faire                  | US-001, US-142                                                                                   |
| Sauvegarde toutes les 4 h et à chaque clôture, restauration guidée | À faire                  | US-142, US-143                                                                                   |

## Démarrage en production

```bash
make certs                      # une fois, sur le serveur
cp backend/.envs/.production/.django.example   backend/.envs/.production/.django
cp backend/.envs/.production/.postgres.example backend/.envs/.production/.postgres
# renseigner les secrets (clé Django, Mailgun, AWS), puis :
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml run --rm django python manage.py migrate
```
