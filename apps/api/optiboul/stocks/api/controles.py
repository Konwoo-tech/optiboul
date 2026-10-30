"""Contrôles de stock (US-093) : liste à compter à l'aveugle, puis validation."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.parametres import parametre
from optiboul.stocks.application import controles as cas
from optiboul.stocks.domain.controles import StatutControle
from optiboul.stocks.infrastructure.controles import depots
from optiboul.stocks.infrastructure.models import ControleStock
from optiboul.stocks.infrastructure.models import LigneControle
from optiboul.stocks.infrastructure.models import Matiere

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class LigneControleSerializer(serializers.ModelSerializer[LigneControle]):
    matiere = serializers.CharField(source="matiere.code")

    class Meta:
        model = LigneControle
        fields = ["matiere", "theorique", "compte", "statut"]
        read_only_fields = fields


class ControleStockSerializer(serializers.ModelSerializer[ControleStock]):
    lignes = serializers.SerializerMethodField()

    class Meta:
        model = ControleStock
        fields = ["id", "semaine", "jour", "portee", "statut", "fait_le", "lignes"]
        read_only_fields = fields

    @extend_schema_field(LigneControleSerializer(many=True))
    def get_lignes(self, controle: ControleStock) -> list[dict[str, Any]]:
        """Vide tant que le contrôle n'est pas fait : le comptage est à l'aveugle."""
        if controle.statut != StatutControle.FAIT:
            return []
        lignes = controle.lignes.select_related("matiere")
        return list(LigneControleSerializer(lignes, many=True).data)


class MatiereACompterSerializer(serializers.ModelSerializer[Matiere]):
    class Meta:
        model = Matiere
        fields = ["code", "nom", "unite"]
        read_only_fields = fields


class ComptesSerializer(serializers.Serializer):
    comptes = serializers.DictField(
        child=serializers.DecimalField(max_digits=12, decimal_places=3),
        help_text="Code de la matière → quantité comptée.",
    )


class ResultatControleSerializer(serializers.Serializer):
    demande = serializers.CharField(
        allow_null=True,
        help_text="DEM-xxx quand un écart dépasse la tolérance (R9).",
    )


class ControlesStockViewSet(ListModelMixin, GenericViewSet):
    """Contrôles de la semaine : prévu, à faire aujourd'hui, fait ou manqué."""

    serializer_class = ControleStockSerializer
    permission_classes = [ProfilParmi("production", *DIRECTION)]
    queryset = ControleStock.objects.order_by("-jour")

    def get_queryset(self) -> QuerySet[ControleStock]:
        controles = super().get_queryset()
        if self.action != "list":
            return controles
        if semaine := self.request.query_params.get("semaine"):
            return controles.filter(semaine_id=semaine)
        return controles

    @extend_schema(
        request=None,
        responses={200: MatiereACompterSerializer(many=True), 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def commencer(self, request: Request, pk: str) -> Response:
        """La liste pré-remplie, sans le stock théorique (O13)."""
        try:
            with transaction.atomic():
                codes = cas.commencer(
                    depots,
                    controle_id=int(pk),
                    auteur=auteur_de(request),
                    aujourdhui=timezone.localdate(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        matieres = Matiere.objects.filter(code__in=codes)
        return Response(MatiereACompterSerializer(matieres, many=True).data)

    @extend_schema(
        request=ComptesSerializer,
        responses={200: ResultatControleSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def valider(self, request: Request, pk: str) -> Response:
        """Écart ≤ tolérance ajusté, au-delà soumis au propriétaire (R9)."""
        corps = ComptesSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                demande = cas.valider(
                    depots,
                    controle_id=int(pk),
                    comptes=corps.validated_data["comptes"],
                    tolerance=parametre("tolerance_inventaire"),
                    auteur=auteur_de(request),
                    maintenant=timezone.localtime(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response({"demande": demande})
