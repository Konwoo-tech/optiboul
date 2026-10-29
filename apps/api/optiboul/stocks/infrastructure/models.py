"""Modèles Django de l'application stocks."""

from django.db import models
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
