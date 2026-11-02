"""Semaine en parallèle de l'Excel (US-151) : les totaux doivent être identiques."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import parser_classes
from rest_framework.decorators import permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.models import Semaine
from optiboul.rapports.infrastructure.rapprochement import rapprocher

if TYPE_CHECKING:
    from rest_framework.request import Request


class RapprochementRequeteSerializer(serializers.Serializer):
    semaine = serializers.IntegerField()
    fichier = serializers.FileField(
        help_text="Colonnes jour, creneau, ventes, recette, une ligne par session.",
    )


class TotauxRapprochementSerializer(serializers.Serializer):
    ventes = serializers.IntegerField()
    recette = serializers.IntegerField()


class EcartSerializer(serializers.Serializer):
    jour = serializers.CharField()
    creneau = serializers.CharField()
    application = TotauxRapprochementSerializer(allow_null=True)
    excel = TotauxRapprochementSerializer(allow_null=True)


class RapprochementSerializer(serializers.Serializer):
    identique = serializers.BooleanField()
    ecarts = EcartSerializer(many=True)


@extend_schema(
    request={"multipart/form-data": RapprochementRequeteSerializer},
    responses={200: RapprochementSerializer, 400: ProblemeSerializer},
)
@api_view(["POST"])
@parser_classes([MultiPartParser])
@permission_classes([ProfilParmi(*DIRECTION)])
def rapprochement(request: Request) -> Response:
    """Compare la semaine, session par session, aux totaux de l'Excel."""
    corps = RapprochementRequeteSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    semaine = get_object_or_404(Semaine, pk=corps.validated_data["semaine"])
    try:
        ecarts = rapprocher(semaine, corps.validated_data["fichier"])
    except RefusMetier as refus:
        return probleme(refus)
    journaliser(
        "rapports.rapprochement",
        auteur=auteur_de(request),
        objet_type="semaine",
        objet_id=semaine.pk,
        apres={"ecarts": len(ecarts)},
    )
    return Response(
        RapprochementSerializer({"identique": not ecarts, "ecarts": ecarts}).data,
    )
