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


class PlanProduction(models.Model):
    """Plan d'une session (jour, créneau) : proposé, puis validé ou provisoire (R4)."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="plans",
        verbose_name=_("semaine"),
    )
    jour = models.DateField(_("jour de la session"))
    creneau = models.CharField(_("créneau"), max_length=4)
    statut = models.CharField(_("statut"), max_length=12, default="propose")
    motif_supplement = models.CharField(
        _("motif du supplément"),
        max_length=12,
        blank=True,
    )
    propose_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("proposé par"),
    )
    propose_le = models.DateTimeField(_("proposé le"), default=timezone.now)
    valide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("validé par"),
    )
    valide_par_nom = models.CharField(_("validé par (nom)"), max_length=255, blank=True)
    valide_le = models.DateTimeField(_("validé le"), null=True, blank=True)
    # Sans réponse à T-15 min : validé dans la tolérance, ou provisoire (O6).
    validation_auto = models.BooleanField(_("décidé automatiquement"), default=False)

    class Meta:
        db_table = "plan_production"
        ordering = ["-jour", "-creneau"]
        constraints = [
            models.UniqueConstraint(
                fields=["jour", "creneau"],
                name="un_plan_par_session",
            ),
        ]
        verbose_name = _("plan de production")
        verbose_name_plural = _("plans de production")

    def __str__(self) -> str:
        return f"Plan {self.creneau} du {self.jour:%d/%m/%Y}"


class LignePlanProduction(models.Model):
    """Un produit du plan, avec la version de fiche utilisée (CdC §5.5)."""

    plan = models.ForeignKey(
        PlanProduction,
        on_delete=models.CASCADE,
        related_name="lignes",
        verbose_name=_("plan"),
    )
    produit = models.ForeignKey(
        Produit,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("produit"),
    )
    fiche = models.ForeignKey(
        FicheTechnique,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("version de fiche"),
    )
    commandes = models.PositiveIntegerField(_("pains commandés"))
    # Demande estimée (CdC §5.5) : habituels sans commande, guichet moyen.
    habituels = models.PositiveIntegerField(_("pains des habituels"), default=0)
    guichet = models.PositiveIntegerField(_("pains au guichet"), default=0)
    supplement = models.PositiveIntegerField(_("sacs de supplément"), default=0)
    sacs = models.PositiveIntegerField(_("sacs"))
    pains_prevus = models.PositiveIntegerField(_("pains prévus"))
    boules = models.PositiveIntegerField(_("boules"))

    class Meta:
        db_table = "ligne_plan"
        ordering = ["produit__ordre"]
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "produit"],
                name="une_ligne_de_plan_par_produit",
            ),
        ]
        verbose_name = _("ligne de plan")
        verbose_name_plural = _("lignes de plan")

    def __str__(self) -> str:
        return f"{self.produit.code} : {self.sacs} sacs"
