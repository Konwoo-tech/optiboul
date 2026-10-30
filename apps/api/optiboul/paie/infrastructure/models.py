"""Modèles Django de l'application paie."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Employe(models.Model):
    """Fiche employé (CdC §5.10) ; un compte n'est pas obligatoire."""

    nom = models.CharField(_("nom"), max_length=150)
    poste = models.CharField(_("poste"), max_length=100, blank=True)
    telephone = models.CharField(_("téléphone"), max_length=20, blank=True)
    salaire_base = models.PositiveIntegerField(_("salaire de base (FCFA)"))
    utilisateur = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="employe",
        verbose_name=_("compte"),
    )
    actif = models.BooleanField(_("actif"), default=True)
    cree_le = models.DateTimeField(_("créé le"), default=timezone.now)

    class Meta:
        db_table = "employe"
        ordering = ["nom", "id"]
        verbose_name = _("employé")
        verbose_name_plural = _("employés")

    def __str__(self) -> str:
        return self.nom


class EtatPaie(models.Model):
    """État de paie d'un mois : brouillon, soumis, validé, paiement, payée."""

    mois = models.DateField(_("mois"), unique=True)
    statut = models.CharField(_("statut"), max_length=12, default="brouillon")
    prepare_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("préparé par"),
    )
    cree_le = models.DateTimeField(_("créé le"), default=timezone.now)

    class Meta:
        db_table = "etat_paie"
        ordering = ["-mois"]
        verbose_name = _("état de paie")
        verbose_name_plural = _("états de paie")

    def __str__(self) -> str:
        return f"Paie {self.mois:%m/%Y}"


class LignePaie(models.Model):
    """La paie d'un employé pour un mois ; la base est figée à la préparation."""

    etat = models.ForeignKey(
        EtatPaie,
        on_delete=models.CASCADE,
        related_name="lignes",
        verbose_name=_("état de paie"),
    )
    employe = models.ForeignKey(
        Employe,
        on_delete=models.PROTECT,
        related_name="lignes_paie",
        verbose_name=_("employé"),
    )
    base = models.PositiveIntegerField(_("base (FCFA)"))
    absences = models.DecimalField(
        _("jours d'absence"),
        max_digits=4,
        decimal_places=1,
        default=0,
    )
    avances = models.PositiveIntegerField(_("avances (FCFA)"), default=0)
    impaye = models.PositiveIntegerField(_("impayé antérieur (FCFA)"), default=0)

    class Meta:
        db_table = "ligne_paie"
        ordering = ["employe__nom", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["etat", "employe"],
                name="une_ligne_par_employe_et_par_mois",
            ),
        ]
        verbose_name = _("ligne de paie")
        verbose_name_plural = _("lignes de paie")

    def __str__(self) -> str:
        return f"{self.employe} · {self.etat}"
