"""Modèles Django de l'application achats."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Fournisseur(models.Model):
    """Fiche fournisseur (CdC §5.7) : matières, téléphone, conditions de paiement."""

    nom = models.CharField(_("nom"), max_length=150)
    telephone = models.CharField(_("téléphone"), max_length=20, blank=True)
    conditions = models.CharField(
        _("conditions de paiement"),
        max_length=255,
        blank=True,
    )
    matieres = models.ManyToManyField(
        "stocks.Matiere",
        related_name="fournisseurs",
        verbose_name=_("matières livrées"),
    )
    actif = models.BooleanField(_("actif"), default=True)
    cree_le = models.DateTimeField(_("créé le"), default=timezone.now)

    class Meta:
        db_table = "fournisseur"
        ordering = ["nom", "id"]
        verbose_name = _("fournisseur")
        verbose_name_plural = _("fournisseurs")

    def __str__(self) -> str:
        return self.nom


class ReceptionPlanifiee(models.Model):
    """Livraison attendue d'un fournisseur, planifiée par le gérant (CdC §5.7)."""

    fournisseur = models.ForeignKey(
        Fournisseur,
        on_delete=models.PROTECT,
        related_name="receptions_planifiees",
        verbose_name=_("fournisseur"),
    )
    matiere = models.ForeignKey(
        "stocks.Matiere",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("matière"),
    )
    quantite = models.DecimalField(
        _("quantité prévue"),
        max_digits=12,
        decimal_places=3,
    )
    prevue_le = models.DateField(_("date prévue"))
    statut = models.CharField(_("statut"), max_length=10, default="planifiee")
    planifiee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("planifiée par"),
    )
    cree_le = models.DateTimeField(_("planifiée le"), default=timezone.now)

    class Meta:
        db_table = "reception_planifiee"
        ordering = ["prevue_le", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantite__gt=0),
                name="reception_quantite_positive",
            ),
        ]
        verbose_name = _("réception planifiée")
        verbose_name_plural = _("réceptions planifiées")

    def __str__(self) -> str:
        return f"{self.fournisseur} · {self.matiere} le {self.prevue_le:%d/%m}"
