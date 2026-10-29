"""Postes de confiance (O1, US-022) : jeton aléatoire signé, cookie HttpOnly."""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.core import signing
from django.utils import timezone

from optiboul.core.api.contexte import entree_de
from optiboul.core.application.journal import Entree
from optiboul.core.infrastructure.journal import journaliser

from .models import PosteConfiance

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse

    from optiboul.core.application.journal import Auteur

    from .models import User

COOKIE = "optiboul_poste"
_SEL = "optiboul.poste-de-confiance"
DUREE = timedelta(days=5 * 365)


def empreinte(jeton: str) -> str:
    return hashlib.sha256(jeton.encode()).hexdigest()


def enregistrer(nom: str, par: User, auteur: Auteur) -> tuple[PosteConfiance, str]:
    """Crée le poste et renvoie la valeur signée du cookie à poser sur ce navigateur."""
    jeton = secrets.token_urlsafe(32)
    poste = PosteConfiance.objects.create(
        nom=nom,
        empreinte=empreinte(jeton),
        cree_par=par,
    )
    journaliser(
        "poste.enregistre",
        auteur=auteur,
        objet_type="poste",
        objet_id=poste.pk,
        apres={"nom": nom},
    )
    return poste, signing.Signer(salt=_SEL).sign(jeton)


def revoquer(poste: PosteConfiance, par: User, auteur: Auteur) -> None:
    if not poste.actif:
        return
    poste.actif = False
    poste.revoque_le = timezone.now()
    poste.revoque_par = par
    poste.save(update_fields=["actif", "revoque_le", "revoque_par"])
    journaliser(
        "poste.revoque",
        auteur=auteur,
        objet_type="poste",
        objet_id=poste.pk,
        avant={"actif": True},
        apres={"actif": False},
    )


def poste_du_cookie(valeur: str | None) -> PosteConfiance | None:
    if not valeur:
        return None
    try:
        jeton = signing.Signer(salt=_SEL).unsign(valeur)
    except signing.BadSignature:
        return None
    return PosteConfiance.objects.filter(empreinte=empreinte(jeton), actif=True).first()


def poser_cookie(reponse: HttpResponse, valeur: str) -> None:
    reponse.set_cookie(
        COOKIE,
        valeur,
        max_age=int(DUREE.total_seconds()),
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="Strict",
    )


class PosteConfianceMiddleware:
    """Rattache à la requête le poste de confiance du navigateur (jamais à distance)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        poste = None
        if entree_de(request) is Entree.LOCALE:
            poste = poste_du_cookie(request.COOKIES.get(COOKIE))
        request.poste_confiance = poste  # type: ignore[attr-defined]
        if poste and (
            poste.dernier_usage is None
            or timezone.now() - poste.dernier_usage > timedelta(hours=1)
        ):
            PosteConfiance.objects.filter(pk=poste.pk).update(
                dernier_usage=timezone.now(),
            )
        return self.get_response(request)
