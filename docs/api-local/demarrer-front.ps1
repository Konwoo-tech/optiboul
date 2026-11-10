# Lance le front sur http://localhost:5175, branché sur l'API locale (vraies données).
#   .\docs\api-local\demarrer-front.ps1 -Cookie "<valeur du cookie optiboul_poste>"
# Le cookie est celui du poste de confiance, affiché par le script de comptes de démonstration
# (docs/api-local/seed_dev.py). Sans lui, l'écran de connexion propose l'adresse e-mail.
# Laisser la fenêtre ouverte : Ctrl+C arrête le serveur.

param(
    [string]$Cookie = "",
    [string]$Api = "http://127.0.0.1:8001",
    [int]$Port = 5175
)

$env:COREPACK_ENABLE_STRICT = "0"
$env:OPTIBOUL_API_URL = $Api
if ($Cookie) { $env:OPTIBOUL_POSTE_COOKIE = $Cookie }

Push-Location "$PSScriptRoot\..\..\apps\web"
try {
    npx --yes pnpm@12.9.1 exec vite --port $Port --strictPort
} finally {
    Pop-Location
}
