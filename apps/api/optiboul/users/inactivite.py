"""Déconnexion automatique après l'inactivité paramétrée au comptoir (CdC §4.2)."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from typing import TYPE_CHECKING

from django.contrib.auth import logout
from django.utils import timezone

from optiboul.core.api.contexte import auteur_de
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre

from .connexion import SESSION_VIA

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import HttpRequest
    from django.http import HttpResponse

SESSION_ACTIVITE = "optiboul_derniere_activite"
# Interrogés par l'application elle-même : ils ne prolongent pas la session.
SANS_ACTIVITE = ("/api/v1/sante/",)


def delai_inactivite() -> timedelta:
    return timedelta(minutes=parametre("inactivite_comptoir"))


class InactiviteMiddleware:
    """Une session ouverte par code sur le poste du comptoir expire sans activité."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.user.is_authenticated and request.session.get(SESSION_VIA) == "code":
            maintenant = timezone.now()
            derniere = request.session.get(SESSION_ACTIVITE)
            if (
                derniere
                and maintenant - datetime.fromisoformat(derniere) > delai_inactivite()
            ):
                journaliser(
                    "connexion.expiree",
                    auteur=auteur_de(request),
                    objet_type="utilisateur",
                    objet_id=request.user.pk,
                )
                logout(request)
            elif request.path not in SANS_ACTIVITE:
                request.session[SESSION_ACTIVITE] = maintenant.isoformat()
        return self.get_response(request)
