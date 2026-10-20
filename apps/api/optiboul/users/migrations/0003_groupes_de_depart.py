from django.db import migrations

# Groupes de départ (cahier des charges §3.2) et le profil de droits que chacun porte.
GROUPES = [
    ("Caisse – équipe de nuit", "caissier"),
    ("Caisse – équipe de jour", "caissier"),
    ("Gérants de la semaine", "gerant"),
    ("Production", "production"),
    ("Direction", "proprietaire"),
    ("Support informatique", "administrateur"),
]


def creer_groupes(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    ProfilGroupe = apps.get_model("users", "ProfilGroupe")
    for nom, profil in GROUPES:
        groupe, _ = Group.objects.get_or_create(name=nom)
        ProfilGroupe.objects.update_or_create(groupe=groupe, defaults={"profil": profil})


def supprimer_groupes(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=[nom for nom, _ in GROUPES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_profil_groupe"),
    ]

    operations = [
        migrations.RunPython(creer_groupes, supprimer_groupes),
    ]
