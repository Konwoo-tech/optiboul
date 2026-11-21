"""Conditions de paiement en liste fermée (#351) ; le texte libre devient une note."""

from django.db import migrations, models

CODES = ("credit_lundi_mardi", "sept_jours", "a_la_livraison")


def code_de(texte: str) -> str:
    """Rapproche un texte libre d'une des trois conditions ; vide sinon."""
    bas = texte.lower()
    if "lundi" in bas or "mardi" in bas or "crédit" in bas or "credit" in bas:
        return "credit_lundi_mardi"
    if "7" in bas or "sept" in bas:
        return "sept_jours"
    if "livraison" in bas or "comptant" in bas:
        return "a_la_livraison"
    return ""


def vers_liste_fermee(apps, schema_editor):
    Fournisseur = apps.get_model("achats", "Fournisseur")
    for fournisseur in Fournisseur.objects.exclude(conditions=""):
        texte = fournisseur.conditions.strip()
        if texte in CODES:
            continue
        code = code_de(texte)
        # Le texte d'origine reste lisible s'il dit plus que le code retenu.
        fournisseur.conditions_note = texte[:255]
        fournisseur.conditions = code
        fournisseur.save(update_fields=["conditions", "conditions_note"])


def vers_texte_libre(apps, schema_editor):
    Fournisseur = apps.get_model("achats", "Fournisseur")
    for fournisseur in Fournisseur.objects.exclude(conditions_note=""):
        fournisseur.conditions = fournisseur.conditions_note
        fournisseur.save(update_fields=["conditions"])


class Migration(migrations.Migration):
    dependencies = [
        ("achats", "0004_manquants"),
    ]

    operations = [
        migrations.AddField(
            model_name="fournisseur",
            name="conditions_note",
            field=models.CharField(
                blank=True,
                max_length=255,
                verbose_name="précision sur les conditions",
            ),
        ),
        migrations.RunPython(vers_liste_fermee, vers_texte_libre),
        migrations.AlterField(
            model_name="fournisseur",
            name="conditions",
            field=models.CharField(
                blank=True,
                choices=[
                    ("credit_lundi_mardi", "À crédit, payé le lundi ou mardi"),
                    ("sept_jours", "À 7 jours"),
                    ("a_la_livraison", "À la livraison"),
                ],
                max_length=20,
                verbose_name="conditions de paiement",
            ),
        ),
    ]
