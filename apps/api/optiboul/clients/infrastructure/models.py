"""Modèles Django de l'application clients."""

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from optiboul.clients.domain.clients import TypeClient


class Client(models.Model):
    """Fiche client (CdC §5.4) ; son solde se calcule depuis ses mouvements (R21)."""

    nom = models.CharField(_("nom"), max_length=150)
    type = models.CharField(
        _("type"),
        max_length=12,
        choices=[(t.value, t.value) for t in TypeClient],
        default=TypeClient.PARTICULIER.value,
    )
    telephone = models.CharField(_("téléphone"), max_length=20, blank=True)
    lieu = models.CharField(_("lieu"), max_length=150, blank=True)
    # Vide : le plafond général (paramètre plafond_dette_client, R6).
    plafond = models.PositiveIntegerField(
        _("plafond propre (FCFA)"),
        null=True,
        blank=True,
    )
    actif = models.BooleanField(_("actif"), default=True)
    cree_le = models.DateTimeField(_("créé le"), default=timezone.now)

    class Meta:
        db_table = "client"
        ordering = ["nom", "id"]
        indexes = [
            # Recherche par les premières lettres au comptoir (spécification §5.1).
            GinIndex(
                fields=["nom"],
                name="client_nom_trgm",
                opclasses=["gin_trgm_ops"],
            ),
        ]
        verbose_name = _("client")
        verbose_name_plural = _("clients")

    def __str__(self) -> str:
        return self.nom


class TarifClient(models.Model):
    """Prix d'un produit pour ce client, en entiers FCFA l'unité."""

    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="tarifs",
        verbose_name=_("client"),
    )
    produit = models.ForeignKey(
        "production.Produit",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("produit"),
    )
    prix = models.PositiveIntegerField(_("prix (FCFA)"))

    class Meta:
        db_table = "tarif_client"
        ordering = ["produit__ordre"]
        constraints = [
            models.UniqueConstraint(
                fields=["client", "produit"],
                name="un_tarif_par_produit",
            ),
        ]
        verbose_name = _("tarif client")
        verbose_name_plural = _("tarifs clients")

    def __str__(self) -> str:
        return f"{self.client} · {self.produit.code} : {self.prix} FCFA"


class MouvementCompte(models.Model):
    """Registre du compte client, en ajout seul (R21) : le solde en est la somme."""

    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name="mouvements",
        verbose_name=_("client"),
    )
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("semaine"),
    )
    sens = models.SmallIntegerField(_("sens"), choices=[(-1, "débit"), (1, "crédit")])
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))
    source_type = models.CharField(_("origine"), max_length=30)
    source_id = models.PositiveBigIntegerField(_("identifiant de l'origine"))
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("auteur"),
    )
    cree_le = models.DateTimeField(_("enregistré le"), default=timezone.now)

    class Meta:
        db_table = "mouvement_compte"
        ordering = ["cree_le", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(montant__gt=0),
                name="mouvement_compte_montant_positif",
            ),
        ]
        verbose_name = _("mouvement de compte")
        verbose_name_plural = _("mouvements de compte")

    def __str__(self) -> str:
        return f"{self.client} {self.sens * self.montant:+} FCFA"


class ReportDette(models.Model):
    """Dette non soldée à la clôture de la semaine, reportée et marquée (R20)."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="dettes_reportees",
        verbose_name=_("semaine clôturée"),
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        related_name="reports",
        verbose_name=_("client"),
    )
    montant = models.PositiveBigIntegerField(_("dette reportée (FCFA)"))
    cree_le = models.DateTimeField(_("reportée le"), default=timezone.now)

    class Meta:
        db_table = "report_dette"
        ordering = ["-montant"]
        constraints = [
            models.UniqueConstraint(
                fields=["semaine", "client"],
                name="un_report_par_semaine",
            ),
        ]
        verbose_name = _("dette reportée")
        verbose_name_plural = _("dettes reportées")

    def __str__(self) -> str:
        return f"{self.client} : {self.montant} FCFA"
