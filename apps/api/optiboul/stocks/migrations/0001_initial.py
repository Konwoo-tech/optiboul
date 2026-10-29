from django.db import migrations
from django.db import models

# Matières de départ (CdC §5.5), figées ici : la migration ne suit pas le code.
MATIERES = [
    ("farine", "Farine", "kg", True, True),
    ("eau", "Eau", "l", False, False),
    ("sel", "Sel", "g", False, True),
    ("levure", "Levure", "g", True, True),
    ("ameliorant", "Améliorant", "g", True, True),
    ("glace", "Glace", "sachet", False, True),
    ("bois", "Bois", "unite", False, True),
    ("huile", "Huile", "l", False, True),
]


def creer_matieres(apps, schema_editor):
    Matiere = apps.get_model("stocks", "Matiere")
    Matiere.objects.bulk_create(
        Matiere(code=code, nom=nom, unite=unite, cle=cle, stockee=stockee, ordre=rang)
        for rang, (code, nom, unite, cle, stockee) in enumerate(MATIERES)
    )


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Matiere",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(max_length=30, unique=True, verbose_name="code")),
                ("nom", models.CharField(max_length=100, verbose_name="nom")),
                ("unite", models.CharField(choices=[("kg", "kg"), ("g", "g"), ("l", "l"), ("sachet", "sachet"), ("unite", "unite")], max_length=10, verbose_name="unité")),
                ("cle", models.BooleanField(default=False, verbose_name="matière clé")),
                ("stockee", models.BooleanField(default=True, verbose_name="suivie en stock")),
                ("ordre", models.PositiveSmallIntegerField(default=0, verbose_name="ordre")),
            ],
            options={
                "verbose_name": "matière",
                "verbose_name_plural": "matières",
                "db_table": "matiere",
                "ordering": ["ordre", "nom"],
            },
        ),
        migrations.RunPython(creer_matieres, migrations.RunPython.noop),
    ]
