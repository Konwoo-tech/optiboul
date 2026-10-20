from typing import TYPE_CHECKING

from django.db import connection
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

if TYPE_CHECKING:
    from rest_framework.request import Request


@extend_schema(
    operation_id="sante",
    responses=inline_serializer(
        "Sante",
        {"statut": serializers.CharField(), "base": serializers.BooleanField()},
    ),
)
@api_view(["GET"])
@permission_classes([AllowAny])
def sante(request: Request) -> Response:
    """État du service, utilisé par les contrôles de santé et le bandeau hors ligne."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        base = cursor.fetchone() == (1,)
    return Response({"statut": "ok", "base": base})
