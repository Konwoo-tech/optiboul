# Variables de session pour l'API locale (développement, sans Docker, PostgreSQL local).
# À charger avec un point : . .\env-local.ps1   (les autres scripts de ce dossier le font seuls).
# Local uniquement : ne jamais utiliser ces valeurs sur un serveur réel.

# Ne pas réutiliser le venv d'un autre projet.
Remove-Item Env:VIRTUAL_ENV -ErrorAction SilentlyContinue

$env:DJANGO_SETTINGS_MODULE = "config.settings.local"
$env:USE_DOCKER = "no"
$env:DATABASE_URL = "postgres://optiboul:optiboul_dev@localhost:5432/optiboul_dev"
$env:REDIS_URL = "redis://localhost:6379/5"
$env:DJANGO_EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
