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


class Livraison(models.Model):
    """Bon de livraison d'une caisse (CdC §5.3) ; le compte du client est débité."""

    numero = models.PositiveIntegerField(_("numéro du bon"), unique=True)
    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="livraisons",
        verbose_name=_("semaine"),
    )
    caisse = models.ForeignKey(
        "caisse.Caisse",
        on_delete=models.PROTECT,
        related_name="livraisons",
        verbose_name=_("caisse"),
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="livraisons",
        verbose_name=_("client"),
    )
    commande = models.ForeignKey(
        Commande,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="livraisons",
        verbose_name=_("commande"),
    )
    statut = models.CharField(_("statut"), max_length=12, default="livree")
    # Au-delà du plafond (R6) : qui a accordé ou refusé la livraison en attente.
    autorisee_par = models.CharField(_("décidée par"), max_length=255, blank=True)
    montant_du = models.PositiveBigIntegerField(_("montant dû (FCFA)"))
    solde_avant = models.BigIntegerField(_("solde avant (FCFA)"))
    solde_apres = models.BigIntegerField(_("solde après (FCFA)"))
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("livrée par"),
    )
    cree_le = models.DateTimeField(_("livrée le"), default=timezone.now)

    class Meta:
        db_table = "livraison"
        ordering = ["-cree_le", "-id"]
        verbose_name = _("livraison")
        verbose_name_plural = _("livraisons")

    def __str__(self) -> str:
        return f"Bon n° {self.numero} · {self.client}"


class LigneLivraison(models.Model):
    livraison = models.ForeignKey(
        Livraison,
        on_delete=models.CASCADE,
        related_name="lignes",
        verbose_name=_("livraison"),
    )
    produit = models.ForeignKey(
        "production.Produit",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("produit"),
    )
    quantite = models.PositiveIntegerField(_("pains"))
    prix_unitaire = models.PositiveIntegerField(_("prix unitaire (FCFA)"))
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))

    class Meta:
        db_table = "ligne_livraison"
        ordering = ["produit__ordre"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantite__gt=0),
                name="ligne_livraison_quantite_positive",
            ),
        ]
        verbose_name = _("ligne de livraison")
        verbose_name_plural = _("lignes de livraison")

    def __str__(self) -> str:
        return f"{self.produit.code} : {self.quantite} à {self.prix_unitaire} FCFA"


MODES_PAIEMENT = [
    ("especes", "espèces"),
    ("mtn", "MTN MoMo"),
    ("orange", "Orange Money"),
]


class Encaissement(models.Model):
    """Paiement d'un client à la caisse, crédité sur son compte dans la transaction."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="encaissements",
        verbose_name=_("semaine"),
    )
    caisse = models.ForeignKey(
        "caisse.Caisse",
        on_delete=models.PROTECT,
        related_name="encaissements",
        verbose_name=_("caisse"),
    )
    client = models.ForeignKey(
        "clients.Client",
        on_delete=models.PROTECT,
        related_name="encaissements",
        verbose_name=_("client"),
    )
    livraison = models.ForeignKey(
        Livraison,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="encaissements",
        verbose_name=_("livraison"),
    )
    mode = models.CharField(
        _("mode"),
        max_length=10,
        choices=MODES_PAIEMENT,
    )
    montant = models.PositiveBigIntegerField(_("montant (FCFA)"))
    reference = models.CharField(
        _("référence de transaction"),
        max_length=60,
        blank=True,
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("encaissé par"),
    )
    cree_le = models.DateTimeField(_("encaissé le"), default=timezone.now)

    class Meta:
        db_table = "encaissement"
        ordering = ["-cree_le", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(montant__gt=0),
                name="encaissement_montant_positif",
            ),
            # R7 : pas de mobile money sans référence de transaction.
            models.CheckConstraint(
                condition=models.Q(mode="especes") | ~models.Q(reference=""),
                name="reference_obligatoire_mobile_money",
            ),
        ]
        verbose_name = _("encaissement")
        verbose_name_plural = _("encaissements")

    def __str__(self) -> str:
        return f"{self.client} : {self.montant} FCFA ({self.mode})"


class MouvementInterne(models.Model):
    """Pains sortis hors livraison, avec un motif (CdC §5.3)."""

    semaine = models.ForeignKey(
        "core.Semaine",
        on_delete=models.PROTECT,
        related_name="mouvements_internes",
        verbose_name=_("semaine"),
    )
    caisse = models.ForeignKey(
        "caisse.Caisse",
        on_delete=models.PROTECT,
        related_name="mouvements_internes",
        verbose_name=_("caisse"),
    )
    genre = models.CharField(
        _("genre"),
        max_length=20,
        choices=[
            ("vente_guichet", "vente au guichet"),
            ("retours", "retours"),
            ("reste_en_salle", "reste en salle"),
            ("ration", "ration"),
        ],
    )
    produit = models.ForeignKey(
        "production.Produit",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("produit"),
    )
    quantite = models.PositiveIntegerField(_("pains"))
    motif = models.TextField(_("motif"))
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("saisi par"),
    )
    cree_le = models.DateTimeField(_("saisi le"), default=timezone.now)

    class Meta:
        db_table = "mouvement_interne"
        ordering = ["-cree_le", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantite__gt=0),
                name="mouvement_interne_quantite_positive",
            ),
        ]
        verbose_name = _("mouvement interne")
        verbose_name_plural = _("mouvements internes")

    def __str__(self) -> str:
        return f"{self.get_genre_display()} : {self.produit.code} {self.quantite}"
