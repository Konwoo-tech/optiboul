# Lance l'API locale sur http://127.0.0.1:8001 (migrations appliquées d'abord).
#   .\docs\api-local\demarrer-api.ps1
# Laisser la fenêtre ouverte : Ctrl+C arrête le serveur.

. "$PSScriptRoot\env-local.ps1"
Push-Location "$PSScriptRoot\..\..\apps\api"
try {
    & .\.venv\Scripts\python.exe manage.py migrate
    & .\.venv\Scripts\python.exe manage.py runserver 8001
} finally {
    Pop-Location
}
