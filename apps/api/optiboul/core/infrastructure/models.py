"""Modèles Django de l'application core."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class LigneJournal(models.Model):
    """Journal en ajout seul (CdC §5.12) : un déclencheur refuse UPDATE et DELETE."""

    horodatage = models.DateTimeField(
        _("horodatage"),
        default=timezone.now,
        db_index=True,
    )
    acteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("acteur"),
    )
    # Copies figées à l'action : le journal reste lisible si le compte change.
    acteur_nom = models.CharField(_("nom de l'acteur"), max_length=255, blank=True)
    profil = models.CharField(_("profil"), max_length=20, blank=True)
    poste_id = models.PositiveBigIntegerField(_("poste"), null=True, blank=True)
    poste_nom = models.CharField(_("nom du poste"), max_length=100, blank=True)
    entree = models.CharField(_("entrée"), max_length=10, default="locale")
    adresse_ip = models.GenericIPAddressField(_("adresse IP"), null=True, blank=True)
    action = models.CharField(_("action"), max_length=100, db_index=True)
    objet_type = models.CharField(
        _("type d'objet"),
        max_length=50,
        blank=True,
        db_index=True,
    )
    objet_id = models.CharField(_("identifiant de l'objet"), max_length=64, blank=True)
    avant = models.JSONField(_("valeurs avant"), null=True, blank=True)
    apres = models.JSONField(_("valeurs après"), null=True, blank=True)

    class Meta:
        db_table = "journal"
        ordering = ["-horodatage", "-id"]
        verbose_name = _("ligne du journal")
        verbose_name_plural = _("journal")

    def __str__(self) -> str:
        acteur = self.acteur_nom or "—"
        return f"{self.horodatage:%d/%m/%Y %H:%M} · {acteur} · {self.action}"


class ValeurParametre(models.Model):
    """Valeur d'un paramètre métier (CdC §9) ; en ajout seul : la dernière fait foi."""

    cle = models.CharField(_("paramètre"), max_length=60, db_index=True)
    valeur = models.JSONField(_("valeur"))
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("modifié par"),
    )
    auteur_nom = models.CharField(_("nom de l'auteur"), max_length=255, blank=True)
    cree_le = models.DateTimeField(_("modifié le"), default=timezone.now)

    class Meta:
        db_table = "parametre"
        ordering = ["cle", "-cree_le", "-id"]
        verbose_name = _("valeur de paramètre")
        verbose_name_plural = _("valeurs des paramètres")

    def __str__(self) -> str:
        return f"{self.cle} = {self.valeur}"
