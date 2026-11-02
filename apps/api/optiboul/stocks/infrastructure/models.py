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


class ControleStock(models.Model):
    """Contrôle physique du mercredi ou du dimanche (R16, O13)."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="controles_stock",
        verbose_name=_("semaine"),
    )
    jour = models.DateField(_("jour"))
    portee = models.CharField(_("portée"), max_length=6)
    statut = models.CharField(_("statut"), max_length=8, default="prevu")
    gerant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        verbose_name=_("gérant"),
    )
    responsable_production = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        verbose_name=_("responsable de production"),
    )
    fait_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        verbose_name=_("fait par"),
    )
    fait_le = models.DateTimeField(_("fait le"), null=True)

    class Meta:
        db_table = "controle_stock"
        ordering = ["jour", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["semaine", "jour"],
                name="un_controle_par_jour_de_semaine",
            ),
        ]
        verbose_name = _("contrôle de stock")
        verbose_name_plural = _("contrôles de stock")

    def __str__(self) -> str:
        return f"Contrôle du {self.jour}"


class LigneControle(models.Model):
    """Ce qui a été compté, et le stock théorique figé à cet instant."""

    controle = models.ForeignKey(
        ControleStock,
        on_delete=models.PROTECT,
        related_name="lignes",
        verbose_name=_("contrôle"),
    )
    matiere = models.ForeignKey(
        Matiere,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("matière"),
    )
    theorique = models.DecimalField(_("théorique"), max_digits=12, decimal_places=3)
    compte = models.DecimalField(_("compté"), max_digits=12, decimal_places=3)
    statut = models.CharField(_("statut"), max_length=8)

    class Meta:
        db_table = "ligne_controle"
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["controle", "matiere"],
                name="une_ligne_par_matiere_de_controle",
            ),
        ]
        verbose_name = _("ligne de contrôle")
        verbose_name_plural = _("lignes de contrôle")

    def __str__(self) -> str:
        return f"{self.matiere} : {self.compte}"


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
