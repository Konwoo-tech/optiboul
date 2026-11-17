from django.db import migrations, models

# Les groupes de départ de users/0003 (cahier des charges §3.2) ne se suppriment pas.
GROUPES_DE_DEPART = [
    "Caisse – équipe de nuit",
    "Caisse – équipe de jour",
    "Gérants de la semaine",
    "Production",
    "Direction",
    "Support informatique",
]


def proteger(apps, schema_editor):
    ProfilGroupe = apps.get_model("users", "ProfilGroupe")
    ProfilGroupe.objects.filter(groupe__name__in=GROUPES_DE_DEPART).update(protege=True)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0009_description_groupe"),
    ]

    operations = [
        migrations.AddField(
            model_name="profilgroupe",
            name="protege",
            field=models.BooleanField(default=False, verbose_name="groupe de départ"),
        ),
        migrations.RunPython(proteger, migrations.RunPython.noop),
    ]
