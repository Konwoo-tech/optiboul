"""Comptes vus par l'administrateur (CdC §5.12) : groupe, déblocage après échecs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.models import Group
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.permissions import ProfilParmi
from optiboul.users import groupes
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
    groupe = serializers.SerializerMethodField()
    bloque = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "groupe",
            "profil",
            "is_active",
            "bloque",
            "bloque_jusqua",
        ]
        read_only_fields = fields

    def get_groupe(self, utilisateur: User) -> int | None:
        groupe = utilisateur.groups.first()
        return groupe.pk if groupe else None

    def get_bloque(self, utilisateur: User) -> bool:
        return verrouillage.est_bloque(utilisateur)


class ChangementGroupeSerializer(serializers.Serializer):
    groupe = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.filter(profil_droits__isnull=False),
    )


class UtilisateursViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = CompteSerializer
    permission_classes = [ProfilParmi("administrateur")]
    queryset = User.objects.order_by("name", "email")

    @extend_schema(request=ChangementGroupeSerializer, responses=CompteSerializer)
    @action(detail=True, methods=["post"])
    def groupe(self, request: Request, pk: str) -> Response:
        """Change la personne de groupe : ses droits changent aussitôt (US-021)."""
        utilisateur = self.get_object()
        corps = ChangementGroupeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        groupes.changer_de_groupe(
            utilisateur,
            corps.validated_data["groupe"],
            auteur_de(request),
        )
        return Response(CompteSerializer(utilisateur).data)

    @extend_schema(request=None, responses=CompteSerializer)
    @action(detail=True, methods=["post"])
    def debloquer(self, request: Request, pk: str) -> Response:
        utilisateur = self.get_object()
        verrouillage.debloquer(utilisateur, auteur_de(request))
        return Response(CompteSerializer(utilisateur).data)
