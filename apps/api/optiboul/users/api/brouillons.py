"""Brouillons de saisie (US-014) : chacun ne voit et ne reprend que les siens."""

from __future__ import annotations

from typing import TYPE_CHECKING

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.users.models import Brouillon

if TYPE_CHECKING:
    from rest_framework.request import Request


class BrouillonSerializer(serializers.ModelSerializer[Brouillon]):
    class Meta:
        model = Brouillon
        fields = ["cle", "contenu", "mis_a_jour"]
        read_only_fields = ["cle", "mis_a_jour"]


class BrouillonsViewSet(ViewSet):
    lookup_field = "cle"
    lookup_value_regex = r"[a-z0-9._-]+"

    def _miens(self, request: Request):
        return Brouillon.objects.filter(auteur_id=request.user.pk)

    @extend_schema(responses=BrouillonSerializer(many=True))
    def list(self, request: Request) -> Response:
        return Response(BrouillonSerializer(self._miens(request), many=True).data)

    @extend_schema(responses={200: BrouillonSerializer, 404: None})
    def retrieve(self, request: Request, cle: str) -> Response:
        brouillon = self._miens(request).filter(cle=cle).first()
        if brouillon is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(BrouillonSerializer(brouillon).data)

    @extend_schema(request=BrouillonSerializer, responses=BrouillonSerializer)
    def update(self, request: Request, cle: str) -> Response:
        corps = BrouillonSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        brouillon, _ = Brouillon.objects.update_or_create(
            auteur_id=request.user.pk,
            cle=cle,
            defaults={"contenu": corps.validated_data["contenu"]},
        )
        return Response(BrouillonSerializer(brouillon).data)

    @extend_schema(responses={204: None})
    def destroy(self, request: Request, cle: str) -> Response:
        self._miens(request).filter(cle=cle).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
