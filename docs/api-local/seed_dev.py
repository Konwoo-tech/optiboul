"""Comptes de démonstration pour le développement local (HORS dépôt, à lancer via `manage.py shell`).

    uv run python manage.py shell -c "exec(open(r'<ce fichier>', encoding='utf8').read())"

Crée un compte par profil (code à 4 chiffres + mot de passe) et un poste de confiance ;
affiche la valeur du cookie `optiboul_poste` à poser dans le navigateur pour la connexion par code.
"""

from django.contrib.auth.models import Group

from optiboul.core.application.journal import Auteur, Entree
from optiboul.users import comptes, connexion, postes
from optiboul.users.models import User

MOT_DE_PASSE = "Optiboul-Dev-2026!"
AUTEUR = Auteur(utilisateur_id=None, nom="seed", profil="", poste_id=None, poste="",
                entree=Entree.LOCALE, adresse_ip="127.0.0.1")

COMPTES = [  # nom, e-mail, téléphone, groupe, code
    ("Admin Dev", "admin@optiboul.local", "677000001", "Support informatique", "1111"),
    ("Patron Dev", "proprietaire@optiboul.local", "677000002", "Direction", "2222"),
    ("Willy Gérant", "gerant@optiboul.local", "677000003", "Gérants de la semaine", "3333"),
    ("Davy Caisse", "caissiere@optiboul.local", "677000004", "Caisse – équipe de jour", "4444"),
    ("Serge Production", "production@optiboul.local", "677000005", "Production", "5555"),
]

for nom, email, tel, groupe, code in COMPTES:
    if User.objects.filter(email=email).exists():
        print("existe déjà :", email)
        continue
    nouveau = comptes.creer(nom=nom, email=email, telephone=tel,
                            groupe=Group.objects.get(name=groupe), canal="sms",
                            code=code, auteur=AUTEUR)
    nouveau.utilisateur.set_password(MOT_DE_PASSE)
    nouveau.utilisateur.save()
    print("créé :", email, "| code", code, "| profil", nouveau.utilisateur.profil)

admin = User.objects.get(email="admin@optiboul.local")
_, cookie = postes.enregistrer("PC du comptoir (dev)", admin, AUTEUR)
print("COOKIE optiboul_poste =", cookie)
