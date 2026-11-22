"""Bilan chiffré d'une semaine (#344), pour l'écran Semaines ; ouverte ou passée."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Count
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.response import Response

from optiboul.achats.infrastructure.models import Reception
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.models import Semaine
from optiboul.depenses.infrastructure.models import Depense
from optiboul.production.infrastructure.models import LignePlanProduction
from optiboul.production.infrastructure.models import Production
from optiboul.ventes.infrastructure.models import Encaissement

if TYPE_CHECKING:
    from rest_framework.request import Request


class DepensesDeLaSemaineSerializer(serializers.Serializer):
    nombre = serializers.IntegerField()
    montant = serializers.IntegerField(help_text="FCFA.")


class ProductionsDeLaSemaineSerializer(serializers.Serializer):
    nombre = serializers.IntegerField()
    sacs = serializers.IntegerField(help_text="Sacs du plan des productions.")


class BilanSemaineSerializer(serializers.Serializer):
    recette = serializers.IntegerField(
        help_text="Encaissements de la semaine, tous modes (FCFA).",
    )
    depenses = DepensesDeLaSemaineSerializer(help_text="Dépenses validées.")
    productions = ProductionsDeLaSemaineSerializer()
    ecart_caisse_cumule = serializers.IntegerField(
        help_text="Somme des écarts des caisses fermées (FCFA).",
    )
    caisses = serializers.IntegerField(help_text="Caisses ouvertes dans la semaine.")
    receptions = serializers.IntegerField(help_text="Réceptions fournisseurs.")


def bilan(semaine_id: int) -> dict[str, Any]:
    """Six agrégats, une requête chacun ; mêmes règles que le tableau de bord."""
    depenses = Depense.objects.filter(
        semaine_id=semaine_id,
        statut="validee",
    ).aggregate(
        nombre=Count("pk"),
        montant=Sum("montant"),
    )
    caisses = Caisse.objects.filter(semaine_id=semaine_id).aggregate(
        nombre=Count("pk"),
        ecart=Sum("ecart"),
    )
    return {
        "recette": Encaissement.objects.filter(semaine_id=semaine_id).aggregate(
            total=Sum("montant"),
        )["total"]
        or 0,
        "depenses": {
            "nombre": depenses["nombre"],
            "montant": depenses["montant"] or 0,
        },
        "productions": {
            "nombre": Production.objects.filter(semaine_id=semaine_id).count(),
            "sacs": LignePlanProduction.objects.filter(
                plan__production__semaine_id=semaine_id,
            ).aggregate(total=Sum("sacs"))["total"]
            or 0,
        },
        "ecart_caisse_cumule": caisses["ecart"] or 0,
        "caisses": caisses["nombre"],
        "receptions": Reception.objects.filter(semaine_id=semaine_id).count(),
    }


@extend_schema(
    operation_id="semaines_bilan_retrieve",
    parameters=[OpenApiParameter("id", int, OpenApiParameter.PATH)],
    responses={200: BilanSemaineSerializer, 404: ProblemeSerializer},
    tags=["semaines"],
)
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def bilan_semaine(request: Request, id: int) -> Response:  # noqa: A002
    """Recette, dépenses, productions, écart de caisse, caisses et réceptions."""
    semaine = get_object_or_404(Semaine, pk=id)
    return Response(bilan(semaine.pk))
