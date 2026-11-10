"""Affiche le dernier message sortant (code de double authentification) du développement local.

Sans worker Celery, les SMS et WhatsApp ne partent pas : le code à six chiffres reste lisible en
clair dans `MessageSortant.contenu`. À lancer depuis `apps/api`, avec les variables de session de
`docs/integration-api-ecarts.md` :

    .venv\\Scripts\\python.exe manage.py shell -c "exec(open(r'..\\..\\docs\\api-local\\dernier_code.py', encoding='utf8').read())"

Local uniquement : ne jamais l'exécuter sur un serveur réel.
"""

from optiboul.notifications.infrastructure.models import MessageSortant

dernier = MessageSortant.objects.order_by("-pk").first()
print(dernier.contenu if dernier else "Aucun message sortant.")
