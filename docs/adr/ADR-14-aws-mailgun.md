# ADR-14 · AWS et Mailgun

**Statut :** acceptée · 20 octobre 2026 · point à confirmer : stockage des justificatifs hors ligne

## Contexte

Le porteur du projet a demandé AWS et Mailgun. La spécification v2 privilégiait `cloud_provider = None` et restic vers S3, au nom du « local d'abord » (R20).

## Décision

- Cookiecutter Django généré avec `cloud_provider = AWS` et `mail_service = Mailgun` (django-anymail).
- `use_whitenoise = y` : les fichiers statiques restent servis par le serveur local, même sans internet.
- Les **médias** (photos de justificatifs) vont sur S3 en production (django-storages).
- La sauvegarde PostgreSQL vers S3 utilise le service `awscli` fourni par Cookiecutter, en attendant la sauvegarde toutes les 4 h et à chaque clôture (US-142).

## Point ouvert

R20 exige qu'aucune action du comptoir ne dépende d'internet. Or, une photo de justificatif envoyée vers S3 sans réseau échoue. Deux options pour US-110 :

1. stocker les médias localement et les répliquer vers S3 par l'outbox (recommandé) ;
2. garder S3 direct et mettre l'envoi de la photo en file côté client.
