"""Export des rapports (US-133) : direction, en PDF ou en Excel, pour archivage."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes

from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.models import Semaine
from optiboul.rapports.infrastructure.exports import Rapport
from optiboul.rapports.infrastructure.exports import en_excel
from optiboul.rapports.infrastructure.exports import en_pdf
from optiboul.rapports.infrastructure.exports import rapport_de_mois
from optiboul.rapports.infrastructure.exports import rapport_de_semaine
from optiboul.rapports.infrastructure.exports import rapport_de_session

if TYPE_CHECKING:
    from rest_framework.request import Request

EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FORMATS = (OpenApiParameter("format_fichier", str, enum=["pdf", "excel"]),)
REPONSES = {
    (200, "application/pdf"): OpenApiTypes.BINARY,
    (200, EXCEL): OpenApiTypes.BINARY,
}


class SessionSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.ChoiceField(choices=["jour", "nuit"])


class MoisSerializer(serializers.Serializer):
    mois = serializers.DateField(input_formats=["%Y-%m"])


class SemaineSerializer(serializers.Serializer):
    semaine = serializers.IntegerField()


def _fichier(request: Request, rapport: Rapport) -> HttpResponse:
    if request.query_params.get("format_fichier") == "excel":
        contenu, type_contenu, extension = en_excel(rapport), EXCEL, "xlsx"
    else:
        contenu, type_contenu, extension = en_pdf(rapport), "application/pdf", "pdf"
    reponse = HttpResponse(contenu, content_type=type_contenu)
    reponse["Content-Disposition"] = (
        f'attachment; filename="{rapport.fichier}.{extension}"'
    )
    return reponse


def _valide(serializer: type[serializers.Serializer], request: Request) -> dict:
    corps = serializer(data=request.query_params)
    corps.is_valid(raise_exception=True)
    return corps.validated_data


@extend_schema(
    parameters=[
        OpenApiParameter("jour", str, required=True),
        OpenApiParameter("creneau", str, required=True, enum=["jour", "nuit"]),
        *FORMATS,
    ],
    responses=REPONSES,
)
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def export_session(request: Request) -> HttpResponse:
    donnees = _valide(SessionSerializer, request)
    return _fichier(request, rapport_de_session(donnees["jour"], donnees["creneau"]))


@extend_schema(
    parameters=[OpenApiParameter("semaine", int, required=True), *FORMATS],
    responses=REPONSES,
)
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def export_semaine(request: Request) -> HttpResponse:
    semaine = get_object_or_404(
        Semaine,
        pk=_valide(SemaineSerializer, request)["semaine"],
    )
    return _fichier(request, rapport_de_semaine(semaine))


@extend_schema(
    parameters=[OpenApiParameter("mois", str, required=True), *FORMATS],
    responses=REPONSES,
)
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def export_mois(request: Request) -> HttpResponse:
    return _fichier(request, rapport_de_mois(_valide(MoisSerializer, request)["mois"]))
