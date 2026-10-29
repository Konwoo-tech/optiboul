"""Modèles Django de l'application production."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Produit(models.Model):
    """Pain vendu et produit : BAG, KO, GC 135… (CdC §5.5)."""

    code = models.CharField(_("code"), max_length=10, unique=True)
    nom = models.CharField(_("nom"), max_length=100)
    nom_en = models.CharField(_("nom en anglais"), max_length=100, blank=True)
    # Prix de vente de base, en entiers FCFA l'unité ; le tarif du client le remplace.
    prix = models.PositiveIntegerField(_("prix de base (FCFA)"), null=True, blank=True)
    actif = models.BooleanField(_("actif"), default=True)
    ordre = models.PositiveSmallIntegerField(_("ordre"), default=0)

    class Meta:
        db_table = "produit"
        ordering = ["ordre", "code"]
        verbose_name = _("produit")
        verbose_name_plural = _("produits")

    def __str__(self) -> str:
        return f"{self.code} · {self.nom}"


class FicheTechnique(models.Model):
    """Version d'une fiche : jamais modifiée, une nouvelle version la remplace."""

    produit = models.ForeignKey(
        Produit,
        on_delete=models.PROTECT,
        related_name="fiches",
        verbose_name=_("produit"),
    )
    version = models.PositiveSmallIntegerField(_("version"))
    poids_boule = models.PositiveIntegerField(_("poids de boule (g)"))
    pains_par_boule = models.PositiveSmallIntegerField(_("pains par boule"))
    pains_par_sac = models.PositiveSmallIntegerField(_("pains par sac"))
    procede = models.TextField(_("procédé"), blank=True)
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("créée par"),
    )
    cree_par_nom = models.CharField(_("créée par (nom)"), max_length=255, blank=True)
    cree_le = models.DateTimeField(_("créée le"), default=timezone.now)

    class Meta:
        db_table = "fiche_technique"
        ordering = ["produit", "-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["produit", "version"],
                name="une_version_de_fiche",
            ),
        ]
        verbose_name = _("fiche technique")
        verbose_name_plural = _("fiches techniques")

    def __str__(self) -> str:
        return f"{self.produit.code} v{self.version}"


class LigneRecette(models.Model):
    """Quantité d'une matière pour un sac de 50 kg, dans l'unité de la matière."""

    fiche = models.ForeignKey(
        FicheTechnique,
        on_delete=models.CASCADE,
        related_name="recette",
        verbose_name=_("fiche"),
    )
    matiere = models.ForeignKey(
        "stocks.Matiere",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("matière"),
    )
    quantite = models.DecimalField(
        _("quantité par sac"),
        max_digits=12,
        decimal_places=3,
    )

    class Meta:
        db_table = "ligne_recette"
        ordering = ["matiere__ordre"]
        constraints = [
            models.UniqueConstraint(
                fields=["fiche", "matiere"],
                name="une_ligne_par_matiere",
            ),
        ]
        verbose_name = _("ligne de recette")
        verbose_name_plural = _("lignes de recette")

    def __str__(self) -> str:
        return f"{self.matiere} : {self.quantite}"
