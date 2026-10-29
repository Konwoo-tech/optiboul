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


class Sauvegarde(models.Model):
    """Une sauvegarde locale ou sa copie cloud chiffrée (CdC §5.12, US-142)."""

    genre = models.CharField(_("genre"), max_length=10)
    declencheur = models.CharField(_("déclencheur"), max_length=20)
    statut = models.CharField(_("statut"), max_length=10, db_index=True)
    source = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="copies",
        verbose_name=_("sauvegarde locale copiée"),
    )
    emplacement = models.CharField(_("emplacement"), max_length=500, blank=True)
    taille = models.PositiveBigIntegerField(_("taille (octets)"), default=0)
    erreur = models.TextField(_("erreur"), blank=True)
    debut = models.DateTimeField(_("début"), default=timezone.now)
    fin = models.DateTimeField(_("fin"), null=True, blank=True)

    class Meta:
        db_table = "sauvegarde"
        ordering = ["-debut", "-id"]
        verbose_name = _("sauvegarde")
        verbose_name_plural = _("sauvegardes")

    def __str__(self) -> str:
        return f"{self.genre} {self.debut:%d/%m/%Y %H:%M} ({self.statut})"


class Semaine(models.Model):
    """Unité de rattachement de toute l'activité (R1) : lundi 06:00 → lundi 06:00."""

    annee = models.PositiveSmallIntegerField(_("année"))
    numero = models.PositiveSmallIntegerField(_("numéro"))
    debut = models.DateTimeField(_("début"))
    fin = models.DateTimeField(_("fin"))
    statut = models.CharField(_("statut"), max_length=10, default="planifiee")
    gerant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="semaines_gerees",
        verbose_name=_("gérant de la semaine"),
    )
    production = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="semaines_en_production",
        verbose_name=_("responsable de production"),
    )
    planifiee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("planifiée par"),
    )
    ouverte_le = models.DateTimeField(_("ouverte le"), null=True, blank=True)
    ouverte_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("ouverte par"),
    )
    cloturee_le = models.DateTimeField(_("clôturée le"), null=True, blank=True)
    cloturee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("clôturée par"),
    )
    cloture_forcee_motif = models.TextField(_("motif de clôture forcée"), blank=True)

    class Meta:
        db_table = "semaine"
        ordering = ["-annee", "-numero"]
        constraints = [
            models.UniqueConstraint(
                fields=["annee", "numero"],
                name="une_semaine_par_numero",
            ),
            # R2 : une seule semaine ouverte à la fois.
            models.UniqueConstraint(
                fields=["statut"],
                condition=models.Q(statut="ouverte"),
                name="une_semaine_ouverte",
            ),
        ]
        verbose_name = _("semaine")
        verbose_name_plural = _("semaines")

    def __str__(self) -> str:
        return f"S{self.numero:02d} {self.annee}"
