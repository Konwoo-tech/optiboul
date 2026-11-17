"""Matières premières, dans l'unité de la recette (CdC §5.5)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.mixins import ListModelMixin
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.production.api.produits import VOIENT_LES_COUTS
from optiboul.stocks.infrastructure.etat import prix_unitaires
from optiboul.stocks.infrastructure.models import Matiere

CENTIME = Decimal("0.01")


class MatiereSerializer(serializers.ModelSerializer[Matiere]):
    prix_unitaire = serializers.SerializerMethodField()

    class Meta:
        model = Matiere
        fields = ["code", "nom", "unite", "cle", "stockee", "prix_unitaire"]
        read_only_fields = fields

    @extend_schema_field(
        serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True),
    )
    def get_prix_unitaire(self, matiere: Matiere) -> str | None:
        """FCFA par unité de la matière, au dernier achat (la farine, au prix du sac).

        Vide sans achat connu, et pour les profils qui ne voient pas les coûts.
        """
        prix = self.context.get("prix_unitaires", {}).get(matiere.code)
        return None if prix is None else str(prix.quantize(CENTIME))


class MatieresViewSet(ListModelMixin, GenericViewSet):
    serializer_class = MatiereSerializer
    permission_classes = [ProfilParmi(*TOUS_LES_PROFILS)]
    queryset = Matiere.objects.all()
    pagination_class = None

    def get_serializer_context(self) -> dict[str, Any]:
        # Les prix suivent la règle des coûts de revient : production et direction.
        if profil_de(self.request) not in VOIENT_LES_COUTS:
            return {**super().get_serializer_context()}
        return {**super().get_serializer_context(), "prix_unitaires": prix_unitaires()}
