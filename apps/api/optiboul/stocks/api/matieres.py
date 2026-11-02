"""Matières premières, dans l'unité de la recette (CdC §5.5)."""

from __future__ import annotations

from rest_framework import serializers
from rest_framework.mixins import ListModelMixin
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.stocks.infrastructure.models import Matiere


class MatiereSerializer(serializers.ModelSerializer[Matiere]):
    class Meta:
        model = Matiere
        fields = ["code", "nom", "unite", "cle", "stockee"]
        read_only_fields = fields


class MatieresViewSet(ListModelMixin, GenericViewSet):
    serializer_class = MatiereSerializer
    permission_classes = [ProfilParmi(*TOUS_LES_PROFILS)]
    queryset = Matiere.objects.all()
    pagination_class = None
