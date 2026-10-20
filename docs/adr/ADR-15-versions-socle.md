# ADR-15 · Versions du socle de l'API

**Statut :** acceptée · 20 octobre 2026

La spécification v2 cite Django 5.2 LTS. Le gabarit Cookiecutter Django courant (16 octobre 2026) génère **Django 6.0, Python 3.14, uv, PostgreSQL 16** (choisi), Celery 5.6, DRF 3.18, django-allauth 65 (MFA).

**Décision :** suivre le gabarit courant pour garder un projet Cookiecutter standard et facile à mettre à jour. Django 6.0 est maintenu jusqu'en avril 2027 ; la montée vers la LTS suivante (6.2) est à planifier au premier trimestre 2027.

**Adaptations au gabarit :**

- API versionnée sous `/api/v1/` ; authentification par session seule (ADR-06), suppression de `rest_framework.authtoken` ;
- 12 applications par domaine en 4 couches, règle de dépendance contrôlée par import-linter ;
- `LANGUAGE_CODE = "fr"`, fuseau `Africa/Douala` ;
- cookie CSRF lisible par les applications React ;
- Traefik : certificat local mkcert, routage par préfixe, entrée distante.
