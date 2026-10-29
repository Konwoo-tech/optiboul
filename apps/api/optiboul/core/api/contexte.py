"""Ce que l'API sait de la requête : auteur, profil, poste, point d'entrée (R1)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Entree

if TYPE_CHECKING:
    from django.http import HttpRequest

# Posé par Traefik sur les requêtes venues du tunnel (ADR-19, US-156).
EN_TETE_ENTREE = "HTTP_X_OPTIBOUL_ENTREE"


def entree_de(request: HttpRequest) -> Entree:
    valeur = request.META.get(EN_TETE_ENTREE, "").strip().lower()
    return Entree.DISTANTE if valeur == Entree.DISTANTE else Entree.LOCALE


def auteur_de(request: HttpRequest) -> Auteur:
    utilisateur = request.user
    poste = getattr(request, "poste_confiance", None)
    connecte = utilisateur.is_authenticated
    return Auteur(
        utilisateur_id=utilisateur.pk if connecte else None,
        nom=(utilisateur.name or utilisateur.email) if connecte else "",  # type: ignore[union-attr]
        profil=(utilisateur.profil or "") if connecte else "",  # type: ignore[union-attr]
        poste_id=poste.pk if poste else None,
        poste=poste.nom if poste else "",
        entree=entree_de(request),
        adresse_ip=request.META.get("REMOTE_ADDR"),
    )
