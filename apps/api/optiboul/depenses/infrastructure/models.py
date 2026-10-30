"""Modèles Django de l'application dépenses."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

CATEGORIES = [
    ("matieres", "Matières premières"),
    ("salaires", "Salaires"),
    ("electricite", "Électricité"),
    ("eau", "Eau"),
    ("administration", "Administration"),
    ("technique", "Technique"),
    ("petit_materiel", "Petit matériel"),
    ("lait", "Lait supplément salaire"),
    ("extra", "Extra"),
]


class Depense(models.Model):
    """Dépense DEP-xxxx, justifiée et rattachée (CdC §5.8)."""

    numero = models.PositiveIntegerField(_("numéro"), unique=True)
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="depenses",
        verbose_name=_("semaine"),
    )
    categorie = models.CharField(_("catégorie"), max_length=20, choices=CATEGORIES)
    libelle = models.CharField(_("libellé"), max_length=200)
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))
    paye_par = models.CharField(
        _("payé par"),
        max_length=10,
        choices=[
            ("caisse", "caisse"),
            ("banque", "banque"),
            ("mobile", "mobile money"),
        ],
    )
    caisse = models.ForeignKey(
        "caisse.Caisse",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="depenses",
        verbose_name=_("caisse"),
    )
    rattachement = models.CharField(
        _("rattachement"),
        max_length=12,
        choices=[
            ("production", "production"),
            ("semaine", "semaine"),
            ("stock", "stock"),
        ],
    )
    production_jour = models.DateField(
        _("session de production"),
        null=True,
        blank=True,
    )
    production_creneau = models.CharField(_("créneau"), max_length=4, blank=True)
    matiere = models.ForeignKey(
        "stocks.Matiere",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("matière"),
    )
    quantite = models.DecimalField(
        _("quantité entrée en stock"),
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    fournisseur = models.CharField(
        _("fournisseur ou marché"),
        max_length=150,
        blank=True,
    )
    justificatif = models.FileField(
        _("justificatif"),
        upload_to="justificatifs/%Y/%m/",
        blank=True,
    )
    achat_courant = models.CharField(_("achat courant"), max_length=10, blank=True)
    pre_autorisation = models.ForeignKey(
        "PreAutorisation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="depenses",
        verbose_name=_("pré-autorisation"),
    )
    statut = models.CharField(_("statut"), max_length=12, default="validee")
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("saisie par"),
    )
    auteur_profil = models.CharField(_("profil de l'auteur"), max_length=20)
    cree_le = models.DateTimeField(_("saisie le"), default=timezone.now)

    class Meta:
        db_table = "depense"
        ordering = ["-cree_le", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(montant__gt=0),
                name="depense_montant_positive",
            ),
        ]
        verbose_name = _("dépense")
        verbose_name_plural = _("dépenses")

    def __str__(self) -> str:
        return f"DEP-{self.numero:04d} · {self.libelle}"


class PreAutorisation(models.Model):
    """Plafond d'un achat courant pour la semaine, fixé par le gérant (O7)."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="pre_autorisations",
        verbose_name=_("semaine"),
    )
    achat_courant = models.CharField(_("achat courant"), max_length=10)
    plafond = models.PositiveBigIntegerField(_("plafond (FCFA)"))
    fixe_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("fixé par"),
    )
    modifie_le = models.DateTimeField(_("modifié le"), default=timezone.now)

    class Meta:
        db_table = "pre_autorisation"
        ordering = ["achat_courant"]
        constraints = [
            models.UniqueConstraint(
                fields=["semaine", "achat_courant"],
                name="une_pre_autorisation_par_achat",
            ),
        ]
        verbose_name = _("pré-autorisation")
        verbose_name_plural = _("pré-autorisations")

    def __str__(self) -> str:
        return f"{self.achat_courant} : {self.plafond} FCFA"
