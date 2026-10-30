"""Registre du stock (US-091, CdC §5.6) : mouvements et stock par matière."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.stocks.infrastructure.models import MouvementStock
from optiboul.stocks.infrastructure.stocks import stock

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class MouvementStockSerializer(serializers.ModelSerializer[MouvementStock]):
    matiere = serializers.CharField(source="matiere.code")
    auteur = serializers.CharField(source="auteur.name")

    class Meta:
        model = MouvementStock
        fields = [
            "id",
            "matiere",
            "sens",
            "quantite",
            "genre",
            "source_type",
            "source_id",
            "motif",
            "semaine",
            "auteur",
            "cree_le",
        ]
        read_only_fields = fields


class StockSerializer(serializers.Serializer):
    quantites = serializers.DictField(
        child=serializers.DecimalField(max_digits=14, decimal_places=3),
        help_text="Code de la matière → stock, dans l'unité de la matière.",
    )


class MouvementsStockViewSet(ListModelMixin, GenericViewSet):
    """Entrées et sorties, liées à leur origine (production, réception…)."""

    serializer_class = MouvementStockSerializer
    permission_classes = [ProfilParmi("production", *DIRECTION)]
    queryset = MouvementStock.objects.select_related("matiere", "auteur").order_by(
        "-cree_le",
        "-id",
    )

    def get_queryset(self) -> QuerySet[MouvementStock]:
        mouvements = super().get_queryset()
        filtres = {"matiere": "matiere__code", "source_type": "source_type"}
        for parametre, champ in filtres.items():
            if valeur := self.request.query_params.get(parametre):
                mouvements = mouvements.filter(**{champ: valeur})
        if source := self.request.query_params.get("source_id"):
            mouvements = mouvements.filter(source_id=source)
        return mouvements

    @extend_schema(
        parameters=[
            OpenApiParameter("matiere", str),
            OpenApiParameter("source_type", str),
            OpenApiParameter("source_id", int),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=StockSerializer)
    @action(detail=False)
    def stock(self, request: Request) -> Response:
        """Stock actuel de chaque matière suivie : somme de ses mouvements."""
        return Response(StockSerializer({"quantites": stock.quantites()}).data)
