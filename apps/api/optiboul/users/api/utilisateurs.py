"""Comptes vus par l'administrateur (CdC §5.12) : déblocage après échecs (US-155)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.permissions import ProfilParmi
from optiboul.users import verrouillage
from optiboul.users.models import Profil
from optiboul.users.models import User

if TYPE_CHECKING:
    from rest_framework.request import Request


class CompteSerializer(serializers.ModelSerializer[User]):
    profil = serializers.ChoiceField(
        choices=Profil.choices,
        read_only=True,
        allow_null=True,
    )
    bloque = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "profil",
            "is_active",
            "bloque",
            "bloque_jusqua",
        ]
        read_only_fields = fields

    def get_bloque(self, utilisateur: User) -> bool:
        return verrouillage.est_bloque(utilisateur)


class UtilisateursViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = CompteSerializer
    permission_classes = [ProfilParmi("administrateur")]
    queryset = User.objects.order_by("name", "email")

    @extend_schema(request=None, responses=CompteSerializer)
    @action(detail=True, methods=["post"])
    def debloquer(self, request: Request, pk: str) -> Response:
        utilisateur = self.get_object()
        verrouillage.debloquer(utilisateur, auteur_de(request))
        return Response(CompteSerializer(utilisateur).data)
