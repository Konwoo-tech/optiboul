"""Création d'un compte en 3 étapes et invitation (US-020, CdC §5.12)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode
from django.utils.http import urlsafe_base64_encode

from optiboul.core.infrastructure.journal import journaliser
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi

from . import connexion
from . import groupes
from . import mfa
from .models import User

if TYPE_CHECKING:
    from django.contrib.auth.models import Group

    from optiboul.core.application.journal import Auteur


@dataclass(frozen=True)
class NouveauCompte:
    utilisateur: User
    codes_secours: list[str]


def lien_invitation(utilisateur: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(utilisateur.pk))
    jeton = default_token_generator.make_token(utilisateur)
    adresse = settings.OPTIBOUL_URL_APPLICATION
    return f"{adresse}/connexion/invitation?uid={uid}&jeton={jeton}"


@transaction.atomic
def creer(  # noqa: PLR0913
    *,
    nom: str,
    email: str,
    telephone: str,
    groupe: Group,
    canal: str,
    code: str | None,
    auteur: Auteur,
) -> NouveauCompte:
    """Identité, groupe, canal et invitation ; l'invitation part par la file d'envoi."""
    utilisateur = User(
        name=nom,
        email=email,
        telephone=telephone,
        canal_verification=canal,
    )
    utilisateur.set_unusable_password()
    utilisateur.save()
    groupes.changer_de_groupe(utilisateur, groupe, auteur)
    if code:
        connexion.definir_code(utilisateur, code)
    codes = mfa.regenerer_codes(utilisateur, auteur)
    lien = lien_invitation(utilisateur)
    file_envoi.mettre_en_file(
        Canal.EMAIL,
        email,
        (
            f"Bonjour {nom},\n\n"
            "Votre compte OptiBoul (Boulangerie du Faubourg) est créé. "
            f"Choisissez votre mot de passe avec ce lien, valable 3 jours :\n{lien}\n\n"
            "Les codes de secours vous sont remis en main propre."
        ),
        sujet="Votre compte OptiBoul",
    )
    file_envoi.mettre_en_file(
        Canal(canal),
        telephone,
        "OptiBoul : votre compte est créé. Le lien pour choisir votre mot de passe "
        f"est envoyé à {email}.",
    )
    journaliser(
        "utilisateur.cree",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
        apres={
            "nom": nom,
            "email": email,
            "groupe": groupe.name,
            "profil": utilisateur.profil,
            "canal": canal,
        },
    )
    return NouveauCompte(utilisateur, codes)


def accepter_invitation(uid: str, jeton: str, mot_de_passe: str) -> User | None:
    """Le jeton ne sert qu'une fois : il dépend du mot de passe qu'il remplace."""
    try:
        pk = int(urlsafe_base64_decode(uid).decode())
    except ValueError:
        return None
    utilisateur = User.objects.filter(pk=pk, is_active=True).first()
    if utilisateur is None or not default_token_generator.check_token(
        utilisateur,
        jeton,
    ):
        return None
    utilisateur.set_password(mot_de_passe)
    utilisateur.save(update_fields=["password"])
    journaliser(
        "utilisateur.invitation_acceptee",
        objet_type="utilisateur",
        objet_id=pk,
    )
    return utilisateur
