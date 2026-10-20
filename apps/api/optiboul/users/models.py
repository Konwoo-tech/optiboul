from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import Group
from django.db.models import CASCADE
from django.db.models import CharField
from django.db.models import EmailField
from django.db.models import Model
from django.db.models import OneToOneField
from django.db.models import TextChoices
from django.urls import reverse
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
