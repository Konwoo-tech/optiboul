"""Modèles Django de l'application demandes."""

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Demande(models.Model):
    """Demande de validation DEM-xxx liée à l'objet qu'elle débloque (CdC §5.9)."""

    numero = models.PositiveIntegerField(_("numéro"), unique=True)
    type = models.CharField(_("type"), max_length=30, db_index=True)
    objet_type = models.CharField(_("type de l'objet lié"), max_length=30)
    objet_id = models.PositiveBigIntegerField(_("objet lié"))
    objet = models.CharField(_("objet lié (libellé)"), max_length=255)
    details = models.JSONField(_("détails"), default=dict, encoder=DjangoJSONEncoder)
    motif = models.TextField(_("motif"))
    emetteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        related_name="demandes_emises",
        verbose_name=_("émise par"),
    )
    emetteur_nom = models.CharField(_("émise par (nom)"), max_length=255)
    emetteur_profil = models.CharField(_("profil de l'émetteur"), max_length=20)
    valideurs = models.JSONField(_("profils valideurs"), default=list)
    statut = models.CharField(_("statut"), max_length=12, default="en_attente")
    cree_le = models.DateTimeField(_("émise le"), default=timezone.now)
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="demandes_decidees",
        verbose_name=_("décidée par"),
    )
    decide_par_nom = models.CharField(
        _("décidée par (nom)"),
        max_length=255,
        blank=True,
    )
    decide_le = models.DateTimeField(_("décidée le"), null=True, blank=True)
    motif_refus = models.TextField(_("motif du refus"), blank=True)
    via = models.CharField(_("décidée depuis"), max_length=10, blank=True)

    class Meta:
        db_table = "demande"
        ordering = ["-cree_le", "-id"]
        constraints = [
            # Une seule demande en attente par objet (pas de doublon au comptoir).
            models.UniqueConstraint(
                fields=["type", "objet_id"],
                condition=models.Q(statut="en_attente"),
                name="une_demande_en_attente_par_objet",
            ),
        ]
        verbose_name = _("demande")
        verbose_name_plural = _("demandes")

    def __str__(self) -> str:
        return f"DEM-{self.numero:03d} · {self.type}"
