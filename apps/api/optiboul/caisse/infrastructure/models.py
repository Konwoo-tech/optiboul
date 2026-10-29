"""Modèles Django de l'application caisse."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Caisse(models.Model):
    """Une caisse par créneau (R17) : la session de vente du jour ou de la nuit."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="caisses",
        verbose_name=_("semaine"),
    )
    jour = models.DateField(_("jour"))
    creneau = models.CharField(_("créneau"), max_length=4)
    caissiere = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="caisses",
        verbose_name=_("ouverte par"),
    )
    planifiee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("caissière planifiée"),
    )
    hors_planning = models.BooleanField(_("hors planning"), default=False)
    fonds = models.PositiveIntegerField(_("fonds (FCFA)"))
    attendu = models.BigIntegerField(_("attendu (FCFA)"), null=True, blank=True)
    compte = models.PositiveBigIntegerField(_("compté (FCFA)"), null=True, blank=True)
    ecart = models.BigIntegerField(_("écart (FCFA)"), null=True, blank=True)
    statut = models.CharField(_("statut"), max_length=10, default="ouverte")
    # Vrai tant que la caisse reçoit des saisies : une seule à la fois.
    en_cours = models.BooleanField(_("en cours"), default=True)
    ouverte_le = models.DateTimeField(_("ouverte le"), default=timezone.now)
    fermee_le = models.DateTimeField(_("fermée le"), null=True, blank=True)

    class Meta:
        db_table = "caisse"
        ordering = ["-jour", "-ouverte_le"]
        constraints = [
            models.UniqueConstraint(
                fields=["jour", "creneau"],
                name="une_caisse_par_creneau",
            ),
            models.UniqueConstraint(
                fields=["en_cours"],
                condition=models.Q(en_cours=True),
                name="une_seule_caisse_en_cours",
            ),
        ]
        verbose_name = _("caisse")
        verbose_name_plural = _("caisses")

    def __str__(self) -> str:
        return f"Caisse {self.creneau} du {self.jour:%d/%m/%Y}"
