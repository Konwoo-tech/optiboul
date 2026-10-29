from decimal import Decimal

from django.db import migrations

# Les sept produits du cahier des charges (§5.5) et leur fiche de départ, figés ici.
# Prix de base connus de la maquette ; les autres restent à saisir par le propriétaire.
PRODUITS = [
    # code, nom, nom anglais, prix, poids de boule (g), pains par boule, pains par sac
    ("BAG", "Baguette", "Baguette", 100, 5000, 20, 315),
    ("KO", "Kirikou", "Kirikou", 70, 3700, 20, 426),
    ("GC135", "Gros court 135", "Short loaf 135", 160, 7300, 20, 216),
    ("GC170", "Gros court 170", "Short loaf 170", None, 4500, 10, 175),
    ("PL", "Pain long", "Long loaf", None, 7300, 20, 216),
    ("C2", "Coupé en 2", "Split loaf", 165, 7300, 20, 216),
    ("PSL", "Spéciaux", "Specials", None, 5250, 10, 150),
]
RECETTE = {
    "farine": Decimal(50),
    "eau": Decimal("27.4"),
    "sel": Decimal(600),
    "levure": Decimal(450),
    "ameliorant": Decimal(300),
    "glace": Decimal(5),
}


def creer_produits(apps, schema_editor):
    Produit = apps.get_model("production", "Produit")
    FicheTechnique = apps.get_model("production", "FicheTechnique")
    LigneRecette = apps.get_model("production", "LigneRecette")
    Matiere = apps.get_model("stocks", "Matiere")
    matieres = dict(Matiere.objects.values_list("code", "pk"))
    for rang, (code, nom, nom_en, prix, boule, par_boule, par_sac) in enumerate(PRODUITS):
        produit = Produit.objects.create(
            code=code,
            nom=nom,
            nom_en=nom_en,
            prix=prix,
            ordre=rang,
        )
        fiche = FicheTechnique.objects.create(
            produit=produit,
            version=1,
            poids_boule=boule,
            pains_par_boule=par_boule,
            pains_par_sac=par_sac,
            cree_par_nom="Reprise du cahier des charges",
        )
        LigneRecette.objects.bulk_create(
            LigneRecette(fiche=fiche, matiere_id=matieres[matiere], quantite=quantite)
            for matiere, quantite in RECETTE.items()
        )


class Migration(migrations.Migration):
    dependencies = [
        ("production", "0001_initial"),
        ("stocks", "0001_initial"),
    ]

    operations = [migrations.RunPython(creer_produits, migrations.RunPython.noop)]
