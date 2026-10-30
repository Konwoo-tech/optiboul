"""Modèles Django de l'application stocks."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from optiboul.stocks.domain.matieres import Unite


class Matiere(models.Model):
    """Matière première : farine, levure… dans l'unité de la recette (CdC §5.5)."""

    code = models.SlugField(_("code"), max_length=30, unique=True)
    nom = models.CharField(_("nom"), max_length=100)
    unite = models.CharField(
        _("unité"),
        max_length=10,
        choices=[(u.value, u.value) for u in Unite],
    )
    cle = models.BooleanField(_("matière clé"), default=False)
    stockee = models.BooleanField(_("suivie en stock"), default=True)
    ordre = models.PositiveSmallIntegerField(_("ordre"), default=0)

    class Meta:
        db_table = "matiere"
        ordering = ["ordre", "nom"]
        verbose_name = _("matière")
        verbose_name_plural = _("matières")

    def __str__(self) -> str:
        return self.nom


class MouvementStock(models.Model):
    """Registre du stock, en ajout seul : une erreur se corrige par un mouvement."""

    matiere = models.ForeignKey(
        Matiere,
        on_delete=models.PROTECT,
        related_name="mouvements",
        verbose_name=_("matière"),
    )
    sens = models.SmallIntegerField(_("sens"), choices=[(-1, "sortie"), (1, "entrée")])
    quantite = models.DecimalField(_("quantité"), max_digits=12, decimal_places=3)
    genre = models.CharField(_("genre"), max_length=12)
    source_type = models.CharField(_("origine"), max_length=30)
    source_id = models.PositiveBigIntegerField(_("identifiant de l'origine"))
    motif = models.CharField(_("motif"), max_length=255, blank=True)
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("semaine"),
    )
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("auteur"),
    )
    cree_le = models.DateTimeField(_("enregistré le"), default=timezone.now)

    class Meta:
        db_table = "mouvement_stock"
        ordering = ["cree_le", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantite__gt=0),
                name="mouvement_stock_quantite_positive",
            ),
        ]
        verbose_name = _("mouvement de stock")
        verbose_name_plural = _("mouvements de stock")

    def __str__(self) -> str:
        return f"{self.matiere} {self.sens * self.quantite:+}"
