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


class FactureFournisseur(models.Model):
    """Facture d'un fournisseur ; la farine de la semaine s'y cumule (CdC §5.7)."""

    numero = models.PositiveIntegerField(_("numéro"), unique=True)
    fournisseur = models.ForeignKey(
        Fournisseur,
        on_delete=models.PROTECT,
        related_name="factures",
        verbose_name=_("fournisseur"),
    )
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="factures_fournisseurs",
        verbose_name=_("semaine"),
    )
    farine = models.BooleanField(_("facture de farine de la semaine"), default=False)
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"), default=0)
    echeance = models.DateField(_("échéance"))
    statut = models.CharField(_("statut"), max_length=10, default="a_payer")
    cree_le = models.DateTimeField(_("créée le"), default=timezone.now)

    class Meta:
        db_table = "facture_fournisseur"
        ordering = ["echeance", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["fournisseur", "semaine"],
                condition=models.Q(farine=True),
                name="une_facture_de_farine_par_semaine",
            ),
        ]
        verbose_name = _("facture fournisseur")
        verbose_name_plural = _("factures fournisseurs")

    def __str__(self) -> str:
        return f"Facture n° {self.numero} · {self.fournisseur}"


class Reception(models.Model):
    """Ce qui a été compté à la livraison (R11), depuis la réception planifiée (O12)."""

    planifiee = models.OneToOneField(
        ReceptionPlanifiee,
        on_delete=models.PROTECT,
        related_name="reception",
        verbose_name=_("réception planifiée"),
    )
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="receptions",
        verbose_name=_("semaine"),
    )
    quantite = models.DecimalField(
        _("quantité comptée"),
        max_digits=12,
        decimal_places=3,
    )
    observation = models.TextField(_("observation"), blank=True)
    prix_unitaire = models.PositiveIntegerField(_("prix unitaire (FCFA)"), default=0)
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))
    facture = models.ForeignKey(
        FactureFournisseur,
        on_delete=models.PROTECT,
        related_name="receptions",
        verbose_name=_("facture"),
    )
    recue_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("réceptionnée par"),
    )
    recue_le = models.DateTimeField(_("réceptionnée le"), default=timezone.now)

    class Meta:
        db_table = "reception"
        ordering = ["-recue_le", "-id"]
        verbose_name = _("réception")
        verbose_name_plural = _("réceptions")

    def __str__(self) -> str:
        return f"Réception {self.planifiee}"


class PaiementFournisseur(models.Model):
    """Paiement d'une facture : il crée une dépense rattachée au stock (CdC §5.7)."""

    facture = models.ForeignKey(
        FactureFournisseur,
        on_delete=models.PROTECT,
        related_name="paiements",
        verbose_name=_("facture"),
    )
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))
    mode = models.CharField(
        _("mode"),
        max_length=10,
        choices=[
            ("especes", "espèces"),
            ("banque", "banque"),
            ("mobile", "mobile money"),
        ],
    )
    reference = models.CharField(_("référence"), max_length=60, blank=True)
    depense = models.OneToOneField(
        "depenses.Depense",
        on_delete=models.PROTECT,
        related_name="paiement_fournisseur",
        verbose_name=_("dépense"),
    )
    paye_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("payé par"),
    )
    paye_le = models.DateTimeField(_("payé le"), default=timezone.now)

    class Meta:
        db_table = "paiement_fournisseur"
        ordering = ["-paye_le", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(montant__gt=0),
                name="paiement_fournisseur_positif",
            ),
        ]
        verbose_name = _("paiement fournisseur")
        verbose_name_plural = _("paiements fournisseurs")

    def __str__(self) -> str:
        return f"{self.facture} : {self.montant} FCFA"
