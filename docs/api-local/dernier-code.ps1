# Affiche le dernier code de double authentification (SMS / WhatsApp) du développement local.
# Sans worker Celery, le message n'est pas envoyé : le code reste lisible dans la base.
#   .\docs\api-local\dernier-code.ps1
# Le code expire au bout de 5 minutes ; chaque demande en crée un nouveau.

. "$PSScriptRoot\env-local.ps1"
Push-Location "$PSScriptRoot\..\..\apps\api"
try {
    & .\.venv\Scripts\python.exe manage.py shell -c "exec(open(r'..\..\docs\api-local\dernier_code.py', encoding='utf8').read())"
} finally {
    Pop-Location
}
