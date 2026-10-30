"""Manquants à livrer (US-102) : tout écart reste suivi jusqu'à livraison (R11)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.achats.application import manquants as cas
from optiboul.achats.application.manquants import StatutManquant
from optiboul.achats.infrastructure.manquants import depots
from optiboul.achats.infrastructure.models import Manquant
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class ManquantSerializer(serializers.ModelSerializer[Manquant]):
    fournisseur = serializers.CharField(source="reception.planifiee.fournisseur.nom")
    matiere = serializers.CharField(source="reception.planifiee.matiere.code")

    class Meta:
        model = Manquant
        fields = [
            "id",
            "reception",
            "fournisseur",
            "matiere",
            "quantite",
            "statut",
            "relances",
            "replanifiee",
            "cree_le",
        ]
        read_only_fields = fields


class ReplanifierSerializer(serializers.Serializer):
    prevue_le = serializers.DateField()


class ManquantsViewSet(ListModelMixin, GenericViewSet):
    """Ce qu'un fournisseur doit encore livrer ; relancer ou replanifier."""

    serializer_class = ManquantSerializer
    permission_classes = [ProfilParmi("production", *DIRECTION)]
    queryset = Manquant.objects.select_related(
        "reception__planifiee__fournisseur",
        "reception__planifiee__matiere",
    )

    def get_queryset(self) -> QuerySet[Manquant]:
        manquants = super().get_queryset()
        if statut := self.request.query_params.get("statut"):
            return manquants.filter(statut=statut)
        return manquants

    @extend_schema(
        parameters=[
            OpenApiParameter("statut", str, enum=[s.value for s in StatutManquant]),
        ],
    )
    def list(self, request: Request, *args: object, **kwargs: object) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=None,
        responses={204: None, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def relancer(self, request: Request, pk: str) -> Response:
        try:
            with transaction.atomic():
                cas.relancer(depots, manquant_id=int(pk), auteur=auteur_de(request))
        except RefusMetier as refus:
            return probleme(refus)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        request=ReplanifierSerializer,
        responses={200: ManquantSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def replanifier(self, request: Request, pk: str) -> Response:
        corps = ReplanifierSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                cas.replanifier(
                    depots,
                    manquant_id=int(pk),
                    prevue_le=corps.validated_data["prevue_le"],
                    auteur=auteur_de(request),
                    aujourdhui=timezone.localdate(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(ManquantSerializer(self.get_queryset().get(pk=pk)).data)
