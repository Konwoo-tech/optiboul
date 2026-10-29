"""Sans réseau : application d'authentification (TOTP) et 10 codes de secours (US-012).

S'appuie sur le module MFA de django-allauth (spécification §7).
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from allauth.mfa.adapter import get_adapter
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.totp.internal.auth import TOTP
from allauth.mfa.totp.internal.auth import generate_totp_secret
from allauth.mfa.totp.internal.auth import validate_totp_code

from optiboul.core.infrastructure.journal import journaliser

if TYPE_CHECKING:
    from django.http import HttpRequest

    from optiboul.core.application.journal import Auteur

    from .models import User

SESSION_SECRET = "optiboul_totp_secret"  # noqa: S105 : clé de session, pas un secret


def _authentificateur(utilisateur: User, genre: str) -> Authenticator | None:
    return Authenticator.objects.filter(user=utilisateur, type=genre).first()


def etat(utilisateur: User) -> dict[str, Any]:
    codes = _authentificateur(utilisateur, Authenticator.Type.RECOVERY_CODES)
    restants = len(RecoveryCodes(codes).get_unused_codes()) if codes else 0
    return {
        "totp": _authentificateur(utilisateur, Authenticator.Type.TOTP) is not None,
        "codesSecoursRestants": restants,
    }


def preparer_totp(request: HttpRequest, utilisateur: User) -> dict[str, str]:
    """Secret à scanner dans Google Authenticator ; activé après un premier code."""
    secret = generate_totp_secret()
    request.session[SESSION_SECRET] = secret
    return {"secret": secret, "uri": get_adapter().build_totp_url(utilisateur, secret)}


def activer_totp(
    request: HttpRequest,
    utilisateur: User,
    code: str,
    auteur: Auteur,
) -> list[str] | None:
    """Active le TOTP ; renvoie les codes de secours s'ils viennent d'être créés."""
    secret = request.session.get(SESSION_SECRET)
    if not secret or not validate_totp_code(secret, code):
        return None
    Authenticator.objects.filter(
        user=utilisateur,
        type=Authenticator.Type.TOTP,
    ).delete()
    TOTP.activate(utilisateur, secret)
    request.session.pop(SESSION_SECRET, None)
    journaliser(
        "mfa.totp_active",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
    )
    if _authentificateur(utilisateur, Authenticator.Type.RECOVERY_CODES):
        return []
    return RecoveryCodes.activate(utilisateur).generate_codes()


def desactiver_totp(utilisateur: User, auteur: Auteur) -> None:
    Authenticator.objects.filter(
        user=utilisateur,
        type=Authenticator.Type.TOTP,
    ).delete()
    journaliser(
        "mfa.totp_desactive",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
    )


def regenerer_codes(utilisateur: User, auteur: Auteur) -> list[str]:
    """10 nouveaux codes à usage unique ; les anciens ne valent plus rien."""
    Authenticator.objects.filter(
        user=utilisateur,
        type=Authenticator.Type.RECOVERY_CODES,
    ).delete()
    codes = RecoveryCodes.activate(utilisateur).generate_codes()
    journaliser(
        "mfa.codes_secours_generes",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
    )
    return codes


def verifier_second_facteur(utilisateur: User, code: str) -> str | None:
    """« totp », « secours » ou None ; un code de secours ne sert qu'une fois."""
    code = code.strip().replace(" ", "")
    totp = _authentificateur(utilisateur, Authenticator.Type.TOTP)
    if totp and TOTP(totp).validate_code(code):
        return "totp"
    secours = _authentificateur(utilisateur, Authenticator.Type.RECOVERY_CODES)
    if secours and RecoveryCodes(secours).validate_code(code):
        return "secours"
    return None
