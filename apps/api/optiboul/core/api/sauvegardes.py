"""Sauvegardes (US-142) : état et lancement manuel, réservés à l'administrateur."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import copie_cloud_en_retard
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde
from optiboul.core.infrastructure.sauvegardes import depot_sauvegardes

from .contexte import auteur_de
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from rest_framework.request import Request


class SauvegardeSerializer(serializers.ModelSerializer[Sauvegarde]):
    class Meta:
        model = Sauvegarde
        fields = [
            "id",
            "genre",
            "declencheur",
            "statut",
            "source",
            "emplacement",
            "taille",
            "erreur",
            "debut",
            "fin",
        ]
        read_only_fields = fields


class EtatSauvegardesSerializer(serializers.Serializer):
    derniere_locale = serializers.DateTimeField(allow_null=True)
    derniere_cloud = serializers.DateTimeField(allow_null=True)
    cloud_en_retard = serializers.BooleanField()
    seuil_alerte_heures = serializers.IntegerField()


class SauvegardesViewSet(ListModelMixin, GenericViewSet):
    serializer_class = SauvegardeSerializer
    permission_classes = [ProfilParmi("administrateur")]
    queryset = Sauvegarde.objects.all()

    @extend_schema(responses=EtatSauvegardesSerializer)
    @action(detail=False)
    def etat(self, request: Request) -> Response:
        seuil = parametre("alerte_sauvegarde_cloud")
        cloud = depot_sauvegardes.derniere_reussie(Genre.CLOUD)
        return Response(
            {
                "derniere_locale": depot_sauvegardes.derniere_reussie(Genre.LOCALE),
                "derniere_cloud": cloud,
                "cloud_en_retard": copie_cloud_en_retard(cloud, timezone.now(), seuil),
                "seuil_alerte_heures": seuil,
            },
        )

    @extend_schema(request=None, responses={202: None})
    @action(detail=False, methods=["post"])
    def lancer(self, request: Request) -> Response:
        demander_sauvegarde(Declencheur.MANUELLE)
        journaliser(
            "sauvegarde.demandee",
            auteur=auteur_de(request),
            objet_type="sauvegarde",
        )
        return Response(status=status.HTTP_202_ACCEPTED)
