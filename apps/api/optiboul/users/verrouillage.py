"""Échecs de connexion, verrouillage temporaire et déblocage (US-155, US-010)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.journal import journaliser

from .domain.verrouillage import EtatVerrou
from .domain.verrouillage import apres_echec
from .domain.verrouillage import apres_reussite

if TYPE_CHECKING:
    from rest_framework.request import Request
    from rest_framework.views import APIView

    from optiboul.core.application.journal import Auteur

    from .models import User


def etat(utilisateur: User) -> EtatVerrou:
    return EtatVerrou(utilisateur.echecs_connexion, utilisateur.bloque_jusqua)


def est_bloque(utilisateur: User) -> bool:
    return etat(utilisateur).bloque(timezone.now())


def enregistrer_echec(
    utilisateur: User,
    methode: str,
    auteur: Auteur = SYSTEME,
) -> bool:
    """Compte l'échec, verrouille au 5ᵉ ; True si le compte vient d'être bloqué."""
    avant = etat(utilisateur)
    apres = apres_echec(avant, timezone.now())
    utilisateur.echecs_connexion = apres.echecs
    utilisateur.bloque_jusqua = apres.bloque_jusqua
    utilisateur.save(update_fields=["echecs_connexion", "bloque_jusqua"])
    journaliser(
        "connexion.echec",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
        apres={"methode": methode, "echecs": apres.echecs},
    )
    verrouille = apres.bloque_jusqua is not None and apres != avant
    if verrouille:
        journaliser(
            "connexion.verrouillage",
            auteur=auteur,
            objet_type="utilisateur",
            objet_id=utilisateur.pk,
            apres={"methode": methode, "jusqua": apres.bloque_jusqua},
        )
    return verrouille


def enregistrer_reussite(utilisateur: User) -> None:
    remis = apres_reussite()
    if etat(utilisateur) != remis:
        utilisateur.echecs_connexion = remis.echecs
        utilisateur.bloque_jusqua = remis.bloque_jusqua
        utilisateur.save(update_fields=["echecs_connexion", "bloque_jusqua"])


def debloquer(utilisateur: User, auteur: Auteur) -> None:
    """Déblocage par l'administrateur, tracé."""
    avant = etat(utilisateur)
    enregistrer_reussite(utilisateur)
    journaliser(
        "compte.debloque",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
        avant={"echecs": avant.echecs, "bloque_jusqua": avant.bloque_jusqua},
        apres={"echecs": 0, "bloque_jusqua": None},
    )


# ---- Limitation du nombre de requêtes (throttling DRF) --------------------------


class LimiteParPoste(SimpleRateThrottle):
    """Tentatives de connexion par poste de confiance (ou par adresse sans poste)."""

    scope = "connexion_poste"

    def get_cache_key(self, request: Request, view: APIView) -> str:
        poste = getattr(request._request, "poste_confiance", None)  # noqa: SLF001
        identite = f"poste-{poste.pk}" if poste else f"ip-{self.get_ident(request)}"
        return self.cache_format % {"scope": self.scope, "ident": identite}


class LimiteParCompte(SimpleRateThrottle):
    """Tentatives de connexion visant un même compte, d'où qu'elles viennent."""

    scope = "connexion_compte"

    def get_cache_key(self, request: Request, view: APIView) -> str | None:
        donnees = request.data if isinstance(request.data, dict) else {}
        compte = donnees.get("utilisateur") or donnees.get("email")
        if not compte:
            return None
        identite = str(compte).strip().lower()
        return self.cache_format % {"scope": self.scope, "ident": identite}
