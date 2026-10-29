from __future__ import annotations

from factory import Faker
from factory import post_generation
from factory.django import DjangoModelFactory

from optiboul.users.models import User


class UserFactory(DjangoModelFactory[User]):
    email = Faker("email")
    name = Faker("name")

    @post_generation
    def password(self: User, create: bool, extracted: str | None, **kwargs):  # noqa: FBT001
        password = (
            extracted
            if extracted
            else Faker(
                "password",
                length=42,
                special_chars=True,
                digits=True,
                upper_case=True,
                lower_case=True,
            ).evaluate(None, None, extra={"locale": None})
        )
        self.set_password(password)
        if create:
            self.save()

    class Meta:
        model = User
        django_get_or_create = ["email"]
        skip_postgeneration_save = True


def utilisateur_avec_profil(profil: str, **champs) -> User:
    """Un utilisateur dans le groupe de départ qui porte ce profil (CdC §3.2)."""
    from django.contrib.auth.models import Group  # noqa: PLC0415

    utilisateur = UserFactory.create(**champs)
    groupe = Group.objects.filter(profil_droits__profil=profil).order_by("pk").first()
    assert groupe is not None, profil
    utilisateur.groups.add(groupe)
    return utilisateur
