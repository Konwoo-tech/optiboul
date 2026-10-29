"""Refus métier rendus en { detail, code, … } (RFC 9457, spécification §6.1)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework import serializers
from rest_framework import status
from rest_framework.response import Response

if TYPE_CHECKING:
    from optiboul.core.domain.erreurs import RefusMetier

# Codes qui ne sont pas des conflits d'état (409) : saisie invalide ou objet absent.
STATUTS = {
    "profil_inadapte": status.HTTP_400_BAD_REQUEST,
    "semaine_inconnue": status.HTTP_404_NOT_FOUND,
    "caisse_inconnue": status.HTTP_404_NOT_FOUND,
    "droit_insuffisant": status.HTTP_403_FORBIDDEN,
    "fiche_invalide": status.HTTP_400_BAD_REQUEST,
}


class ProblemeSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()


def probleme(refus: RefusMetier) -> Response:
    statut = STATUTS.get(refus.code, status.HTTP_409_CONFLICT)
    return Response(
        {"detail": refus.detail, "code": refus.code, **refus.autres},
        status=statut,
    )
