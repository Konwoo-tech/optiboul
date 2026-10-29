"""Modèles Django de l'application ventes."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Commande(models.Model):
    """Commande d'un client pour une session (jour et créneau), une par client."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="commandes",
        verbose_name=_("semaine"),
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="commandes",
        verbose_name=_("client"),
    )
    jour = models.DateField(_("jour de la session"))
    creneau = models.CharField(_("créneau"), max_length=4)
    apres_heure_limite = models.BooleanField(_("après l'heure limite"), default=False)
    saisie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("saisie par"),
    )
    saisie_le = models.DateTimeField(_("saisie le"), default=timezone.now)
    modifiee_le = models.DateTimeField(_("modifiée le"), default=timezone.now)

    class Meta:
        db_table = "commande"
        ordering = ["jour", "creneau", "client__nom"]
        constraints = [
            models.UniqueConstraint(
                fields=["client", "jour", "creneau"],
                name="une_commande_par_client_et_session",
            ),
        ]
        verbose_name = _("commande")
        verbose_name_plural = _("commandes")

    def __str__(self) -> str:
        return f"{self.client} · {self.creneau} du {self.jour:%d/%m}"


class LigneCommande(models.Model):
    commande = models.ForeignKey(
        Commande,
        on_delete=models.CASCADE,
        related_name="lignes",
        verbose_name=_("commande"),
    )
    produit = models.ForeignKey(
        "production.Produit",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("produit"),
    )
    quantite = models.PositiveIntegerField(_("pains"))

    class Meta:
        db_table = "ligne_commande"
        ordering = ["produit__ordre"]
        constraints = [
            models.UniqueConstraint(
                fields=["commande", "produit"],
                name="une_ligne_par_produit",
            ),
            models.CheckConstraint(
                condition=models.Q(quantite__gt=0),
                name="ligne_commande_quantite_positive",
            ),
        ]
        verbose_name = _("ligne de commande")
        verbose_name_plural = _("lignes de commande")

    def __str__(self) -> str:
        return f"{self.produit.code} : {self.quantite} pains"
