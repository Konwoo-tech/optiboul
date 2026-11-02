# Accès distant par le tunnel

Le propriétaire et le gérant ouvrent l'application depuis leur téléphone, hors de la boulangerie (US-144, ADR-19). Aucun port n'est ouvert sur la box : c'est le serveur qui se connecte au tunnel.

## Mettre en service

1. Créer un tunnel dans Cloudflare Zero Trust, avec pour cible `http://traefik:8443`, et noter son jeton.
2. Sur le serveur, dans `apps/api/.envs/.production/.django` :
   - `CLOUDFLARE_TUNNEL_TOKEN` : le jeton ;
   - `DJANGO_ALLOWED_HOSTS` : ajouter le nom public ;
   - `DJANGO_CSRF_TRUSTED_ORIGINS` : `https://` suivi du nom public.
3. Démarrer le tunnel :

```bash
docker compose -f docker-compose.production.yml --profile distant up -d
```

## Vérifier avant de s'en servir

Depuis un téléphone **sans le Wi-Fi de la boulangerie** :

| Essai | Résultat attendu |
| --- | --- |
| Ouvrir le nom public | L'application web s'affiche |
| Se connecter par nom et code à 4 chiffres | Refusé |
| Se connecter par e-mail | Double authentification demandée |
| Ouvrir `/django-admin/` | Pas d'administration Django |
| Essayer le port de Flower | Injoignable |

Ces essais demandent un vrai jeton : les tests automatiques ne vérifient que la configuration.

## Limites

- Sans internet à la boulangerie, le tunnel tombe ; le comptoir continue en local.
- Révoquer le jeton dans Cloudflare coupe aussitôt l'accès distant.
