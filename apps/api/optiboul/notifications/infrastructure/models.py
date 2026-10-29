"""Modèles Django de l'application notifications."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import StatutEnvoi

CANAUX = [(c.value, c.value) for c in Canal]


class Notification(models.Model):
    """Notification dans l'application (CdC §5.13), adressée à une personne."""

    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name=_("destinataire"),
    )
    genre = models.CharField(_("type"), max_length=50, db_index=True)
    titre = models.CharField(_("titre"), max_length=200)
    message = models.TextField(_("message"), blank=True)
    lien = models.CharField(_("lien"), max_length=200, blank=True)
    cree_le = models.DateTimeField(_("créée le"), default=timezone.now)
    lue_le = models.DateTimeField(_("lue le"), null=True, blank=True)

    class Meta:
        db_table = "notification"
        ordering = ["-cree_le", "-id"]
        verbose_name = _("notification")
        verbose_name_plural = _("notifications")

    def __str__(self) -> str:
        return f"{self.destinataire} · {self.titre}"


class MessageSortant(models.Model):
    """Ligne de la file d'envoi (outbox, O15), écrite avec l'opération."""

    canal = models.CharField(
        _("canal"),
        max_length=10,
        choices=CANAUX,
    )
    destinataire = models.CharField(_("destinataire"), max_length=255)
    sujet = models.CharField(_("sujet"), max_length=200, blank=True)
    contenu = models.TextField(_("contenu"))
    statut = models.CharField(
        _("statut"),
        max_length=12,
        choices=[(s.value, s.value) for s in StatutEnvoi],
        default=StatutEnvoi.EN_ATTENTE,
        db_index=True,
    )
    tentatives = models.PositiveSmallIntegerField(_("tentatives"), default=0)
    prochain_essai = models.DateTimeField(_("prochain essai"), default=timezone.now)
    derniere_erreur = models.TextField(_("dernière erreur"), blank=True)
    cree_le = models.DateTimeField(_("créé le"), default=timezone.now)
    envoye_le = models.DateTimeField(_("envoyé le"), null=True, blank=True)
    # Ce que le message accompagne (bon, relance…) : son état s'affiche avec l'objet.
    objet_type = models.CharField(_("type de l'objet"), max_length=30, blank=True)
    objet_id = models.PositiveBigIntegerField(_("objet"), null=True, blank=True)

    class Meta:
        db_table = "outbox_message"
        ordering = ["cree_le", "id"]
        indexes = [
            models.Index(fields=["objet_type", "objet_id"], name="outbox_objet"),
        ]
        verbose_name = _("message à envoyer")
        verbose_name_plural = _("file d'envoi")

    def __str__(self) -> str:
        return f"{self.get_canal_display()} → {self.destinataire} ({self.statut})"


class RegleNotification(models.Model):
    """Destinataires et canaux d'un type de notification (CdC §5.13), modifiables.

    Sans ligne pour un type, la table de départ du domaine s'applique.
    """

    genre = models.CharField(_("type"), max_length=50, unique=True)
    profils = models.JSONField(_("profils destinataires"), default=list)
    canaux = models.JSONField(_("canaux"), default=list)
    modifie_par = models.CharField(_("modifiée par"), max_length=255, blank=True)
    modifie_le = models.DateTimeField(_("modifiée le"), default=timezone.now)

    class Meta:
        db_table = "regle_notification"
        ordering = ["genre"]
        verbose_name = _("règle de notification")
        verbose_name_plural = _("règles de notification")

    def __str__(self) -> str:
        return self.genre
