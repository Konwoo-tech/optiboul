"""Postes de confiance (US-022) : enregistrés et révoqués par l'administrateur."""

from __future__ import annotations

from typing import TYPE_CHECKING

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.mixins import ListModelMixin
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.contexte import entree_de
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.application.journal import Entree
from optiboul.users import postes
from optiboul.users.models import PosteConfiance

if TYPE_CHECKING:
    from rest_framework.request import Request


class PosteSerializer(serializers.ModelSerializer[PosteConfiance]):
    cree_par = serializers.CharField(source="cree_par.name", read_only=True)

    class Meta:
        model = PosteConfiance
        fields = [
            "id",
            "nom",
            "actif",
            "cree_le",
            "cree_par",
            "revoque_le",
            "dernier_usage",
        ]
        read_only_fields = [
            "id",
            "actif",
            "cree_le",
            "cree_par",
            "revoque_le",
            "dernier_usage",
        ]


class PosteActuelSerializer(serializers.Serializer):
    poste = PosteSerializer(allow_null=True)


class PostesViewSet(ListModelMixin, GenericViewSet):
    serializer_class = PosteSerializer
    queryset = PosteConfiance.objects.select_related("cree_par")

    def get_permissions(self):
        if self.action == "actuel":
            return [AllowAny()]
        return [ProfilParmi("administrateur")()]

    @extend_schema(request=PosteSerializer, responses={201: PosteSerializer})
    def create(self, request: Request) -> Response:
        """Enregistre ce navigateur comme poste de confiance (cookie signé)."""
        if entree_de(request) is Entree.DISTANTE:
            message = "Un poste de confiance s'enregistre depuis la boulangerie."
            raise PermissionDenied(message)
        donnees = PosteSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        poste, cookie = postes.enregistrer(
            donnees.validated_data["nom"],
            request.user,  # type: ignore[arg-type]
            auteur_de(request),
        )
        reponse = Response(PosteSerializer(poste).data, status=status.HTTP_201_CREATED)
        postes.poser_cookie(reponse, cookie)
        return reponse

    @extend_schema(request=None, responses=PosteSerializer)
    @action(detail=True, methods=["post"])
    def revoquer(self, request: Request, pk: str) -> Response:
        poste = self.get_object()
        postes.revoquer(poste, request.user, auteur_de(request))  # type: ignore[arg-type]
        return Response(PosteSerializer(poste).data)

    @extend_schema(responses=PosteActuelSerializer)
    @action(detail=False)
    def actuel(self, request: Request) -> Response:
        """Ce navigateur est-il un poste de confiance ? (écran de connexion, O1)."""
        poste = getattr(request, "poste_confiance", None)
        return Response({"poste": PosteSerializer(poste).data if poste else None})
