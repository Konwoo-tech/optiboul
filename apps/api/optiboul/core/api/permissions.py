"""Permissions par profil (CdC §3.3) : l'application web n'affiche, l'API décide."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework.permissions import BasePermission

if TYPE_CHECKING:
    from rest_framework.request import Request
    from rest_framework.views import APIView


def profil_de(request: Request) -> str | None:
    utilisateur = request.user
    if not utilisateur or not utilisateur.is_authenticated:
        return None
    return utilisateur.profil


def ProfilParmi(*profils: str) -> type[BasePermission]:  # noqa: N802
    """Classe de permission : la personne connectée a l'un des profils donnés."""

    class _ProfilParmi(BasePermission):
        message = "Votre profil ne permet pas cette action."

        def has_permission(self, request: Request, view: APIView) -> bool:
            return profil_de(request) in profils

    _ProfilParmi.__name__ = f"ProfilParmi({', '.join(profils)})"
    return _ProfilParmi


DIRECTION = ("gerant", "proprietaire")
TOUS_LES_PROFILS = (
    "caissier",
    "gerant",
    "production",
    "proprietaire",
    "administrateur",
)
