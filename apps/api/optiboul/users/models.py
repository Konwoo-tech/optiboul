from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import Group
from django.db.models import CASCADE
from django.db.models import PROTECT
from django.db.models import BooleanField
from django.db.models import CharField
from django.db.models import DateTimeField
from django.db.models import EmailField
from django.db.models import ForeignKey
from django.db.models import Model
from django.db.models import OneToOneField
from django.db.models import PositiveSmallIntegerField
from django.db.models import TextChoices
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class Profil(TextChoices):
    """Profils de droits (CdC §3.1) : ils décident des espaces de l'application web."""

    CAISSIER = "caissier", _("Caissier / caissière")
    GERANT = "gerant", _("Gérant de la semaine")
    PRODUCTION = "production", _("Responsable de production")
    PROPRIETAIRE = "proprietaire", _("Propriétaire")
    ADMINISTRATEUR = "administrateur", _("Administrateur")


class ProfilGroupe(Model):
    """Le groupe porte le profil de droits (cahier des charges §3.2)."""

    groupe = OneToOneField(
        Group,
        on_delete=CASCADE,
        primary_key=True,
        related_name="profil_droits",
        verbose_name=_("groupe"),
    )
    profil = CharField(_("profil"), max_length=20, choices=Profil)

    class Meta:
        verbose_name = _("profil du groupe")
        verbose_name_plural = _("profils des groupes")

    def __str__(self) -> str:
        return f"{self.groupe.name} : {self.get_profil_display()}"


class User(AbstractUser):
    """
    Default custom user model for OptiBoul.
    If adding fields that need to be filled at user signup,
    check forms.SignupForm and forms.SocialSignupForms accordingly.
    """

    # First and last name do not cover name patterns around the globe
    name = CharField(_("Name of User"), blank=True, max_length=255)
    first_name = None  # type: ignore[assignment]
    last_name = None  # type: ignore[assignment]
    email = EmailField(_("email address"), unique=True)
    username = None  # type: ignore[assignment]
    # Code à 4 chiffres faux à la suite ; 5 bloquent le compte 15 min (CdC §4.2).
    echecs_connexion = PositiveSmallIntegerField(_("échecs de connexion"), default=0)
    bloque_jusqua = DateTimeField(_("bloqué jusqu'à"), null=True, blank=True)
    # Code à 4 chiffres du comptoir, haché en Argon2 (O1) ; vide : pas de code.
    code_pin = CharField(_("code à 4 chiffres"), max_length=128, blank=True, default="")
    # Double authentification (CdC §4.1) : numéro +237, canal préféré, dernier passage.
    telephone = CharField(_("téléphone"), max_length=20, blank=True, default="")
    canal_verification = CharField(
        _("canal de vérification"),
        max_length=10,
        choices=[("sms", "SMS"), ("whatsapp", "WhatsApp")],
        default="sms",
    )
    derniere_double_auth = DateTimeField(
        _("dernière double authentification"),
        null=True,
        blank=True,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects: ClassVar[UserManager] = UserManager()

    @property
    def profil(self) -> str | None:
        """Profil porté par le groupe ; un super-utilisateur est administrateur."""
        if self.is_superuser:
            return Profil.ADMINISTRATEUR
        groupe = (
            self.groups.filter(profil_droits__isnull=False)
            .select_related("profil_droits")
            .first()
        )
        return groupe.profil_droits.profil if groupe else None

    def get_absolute_url(self) -> str:
        """Get URL for user's detail view.

        Returns:
            str: URL for user detail.

        """
        return reverse("users:detail", kwargs={"pk": self.id})


class PosteConfiance(Model):
    """Poste du comptoir enregistré (O1, US-022) : seule l'empreinte du jeton reste."""

    nom = CharField(_("nom"), max_length=100)
    empreinte = CharField(_("empreinte du jeton"), max_length=64, unique=True)
    actif = BooleanField(_("actif"), default=True)
    cree_le = DateTimeField(_("enregistré le"), default=timezone.now)
    cree_par = ForeignKey(
        "users.User",
        on_delete=PROTECT,
        related_name="+",
        verbose_name=_("enregistré par"),
    )
    revoque_le = DateTimeField(_("révoqué le"), null=True, blank=True)
    revoque_par = ForeignKey(
        "users.User",
        on_delete=PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("révoqué par"),
    )
    dernier_usage = DateTimeField(_("dernier usage"), null=True, blank=True)

    class Meta:
        db_table = "poste_confiance"
        ordering = ["nom"]
        verbose_name = _("poste de confiance")
        verbose_name_plural = _("postes de confiance")

    def __str__(self) -> str:
        return self.nom


class CodeVerification(Model):
    """Code à 6 chiffres envoyé par SMS ou WhatsApp (CdC §4.1), haché, 5 minutes."""

    utilisateur = ForeignKey(
        "users.User",
        on_delete=CASCADE,
        related_name="codes_verification",
        verbose_name=_("utilisateur"),
    )
    code = CharField(_("code haché"), max_length=128)
    canal = CharField(_("canal"), max_length=10)
    cree_le = DateTimeField(_("envoyé le"), default=timezone.now)
    expire_le = DateTimeField(_("expire le"))
    essais = PositiveSmallIntegerField(_("essais"), default=0)
    utilise = BooleanField(_("utilisé"), default=False)

    class Meta:
        db_table = "code_verification"
        ordering = ["-cree_le", "-id"]
        verbose_name = _("code de vérification")
        verbose_name_plural = _("codes de vérification")

    def __str__(self) -> str:
        return f"{self.utilisateur} · {self.canal} · {self.cree_le:%d/%m %H:%M}"
