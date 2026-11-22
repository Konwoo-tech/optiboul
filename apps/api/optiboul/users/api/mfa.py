"""Application d'authentification et codes de secours de la personne connectée."""

from __future__ import annotations

from typing import TYPE_CHECKING

from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.users import mfa

if TYPE_CHECKING:
    from rest_framework.request import Request


# `GET /mfa/` renvoie un seul état, pas une liste (#357).
@extend_schema_serializer(many=False)
class EtatMfaSerializer(serializers.Serializer):
    totp = serializers.BooleanField()
    codesSecoursRestants = serializers.IntegerField()  # noqa: N815


class SecretTotpSerializer(serializers.Serializer):
    secret = serializers.CharField()
    uri = serializers.CharField()


class CodeTotpSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)


class CodesSecoursSerializer(serializers.Serializer):
    codesSecours = serializers.ListField(child=serializers.CharField())  # noqa: N815


class MfaViewSet(ViewSet):
    """US-012 : TOTP compatible Google Authenticator, 10 codes de secours."""

    @extend_schema(responses=EtatMfaSerializer)
    def list(self, request: Request) -> Response:
        return Response(mfa.etat(request.user))  # type: ignore[arg-type]

    @extend_schema(request=None, responses=SecretTotpSerializer)
    @action(detail=False, methods=["post"], url_path="totp/preparer")
    def preparer_totp(self, request: Request) -> Response:
        return Response(mfa.preparer_totp(request._request, request.user))  # type: ignore[arg-type]  # noqa: SLF001

    @extend_schema(
        request=CodeTotpSerializer,
        responses={200: CodesSecoursSerializer, 400: None},
    )
    @action(detail=False, methods=["post"], url_path="totp/activer")
    def activer_totp(self, request: Request) -> Response:
        corps = CodeTotpSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        codes = mfa.activer_totp(
            request._request,  # noqa: SLF001
            request.user,  # type: ignore[arg-type]
            corps.validated_data["code"],
            auteur_de(request),
        )
        if codes is None:
            return Response(
                {"detail": "Code incorrect.", "code": "code_incorrect"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"codesSecours": codes})

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="totp/desactiver")
    def desactiver_totp(self, request: Request) -> Response:
        mfa.desactiver_totp(request.user, auteur_de(request))  # type: ignore[arg-type]
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses=CodesSecoursSerializer)
    @action(detail=False, methods=["post"], url_path="codes-secours")
    def codes_secours(self, request: Request) -> Response:
        codes = mfa.regenerer_codes(request.user, auteur_de(request))  # type: ignore[arg-type]
        return Response({"codesSecours": codes})
