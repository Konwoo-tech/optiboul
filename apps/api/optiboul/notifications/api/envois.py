"""État en ligne et envois en attente (US-140, CdC §5.13, O15)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Max
from django.db.models import Min
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.response import Response

from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.notifications.domain.envois import EtatInternet
from optiboul.notifications.domain.envois import StatutEnvoi
from optiboul.notifications.domain.envois import etat_internet
from optiboul.notifications.infrastructure.models import MessageSortant

if TYPE_CHECKING:
    from rest_framework.request import Request


class EtatEnvoisSerializer(serializers.Serializer):
    internet = serializers.ChoiceField(
        choices=[e.value for e in EtatInternet],
        help_text="D'après la dernière tentative de la file d'envoi.",
    )
    en_attente = serializers.IntegerField(help_text="Messages qui partiront au retour.")
    en_echec = serializers.IntegerField()
    plus_ancien_en_attente = serializers.DateTimeField(allow_null=True)
    derniere_tentative = serializers.DateTimeField(allow_null=True)


@extend_schema(responses=EtatEnvoisSerializer)
@api_view(["GET"])
@permission_classes([ProfilParmi(*TOUS_LES_PROFILS)])
def etat_des_envois(request: Request) -> Response:
    """Pour le bandeau : internet, et ce qui attend dans la file d'envoi (O15)."""
    succes = MessageSortant.objects.filter(statut=StatutEnvoi.ENVOYE).aggregate(
        le=Max("derniere_tentative"),
    )["le"]
    echec = (
        MessageSortant.objects.exclude(statut=StatutEnvoi.ENVOYE)
        .exclude(tentatives=0)
        .aggregate(le=Max("derniere_tentative"))["le"]
    )
    en_attente = MessageSortant.objects.filter(statut=StatutEnvoi.EN_ATTENTE)
    return Response(
        EtatEnvoisSerializer(
            {
                "internet": etat_internet(succes, echec),
                "en_attente": en_attente.count(),
                "en_echec": MessageSortant.objects.filter(
                    statut=StatutEnvoi.ECHEC,
                ).count(),
                "plus_ancien_en_attente": en_attente.aggregate(le=Min("cree_le"))["le"],
                "derniere_tentative": max(filter(None, [succes, echec]), default=None),
            },
        ).data,
    )
