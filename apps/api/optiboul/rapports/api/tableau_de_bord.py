"""Indicateurs et graphiques du mois (US-131, CdC §5.11)."""

from __future__ import annotations

from datetime import date
from datetime import datetime
from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import PaiementFournisseur
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.cloture import debiteurs
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.depenses.api.budgets import budget_du_mois
from optiboul.production.infrastructure.models import Fournee
from optiboul.rapports.domain.indicateurs import bornes_du_mois
from optiboul.rapports.domain.indicateurs import taux_encaissement
from optiboul.ventes.infrastructure.models import Encaissement
from optiboul.ventes.infrastructure.models import Livraison

if TYPE_CHECKING:
    from rest_framework.request import Request


class IndicateursSerializer(serializers.Serializer):
    recette = serializers.IntegerField(help_text="Encaissements du mois, en FCFA.")
    ventes = serializers.IntegerField(help_text="Montant dû des livraisons du mois.")
    taux_encaissement = serializers.IntegerField(allow_null=True)
    dettes_clients = serializers.IntegerField()
    dettes_fournisseurs = serializers.IntegerField()
    ecart_caisse_cumule = serializers.IntegerField()


class RecetteSessionSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.CharField()
    recette = serializers.IntegerField()


class ProductionProduitSerializer(serializers.Serializer):
    code = serializers.CharField()
    pains = serializers.IntegerField()


class BudgetCategorieSerializer(serializers.Serializer):
    categorie = serializers.CharField()
    budget = serializers.IntegerField()
    depense = serializers.IntegerField()


class GraphiquesSerializer(serializers.Serializer):
    recette_par_session = RecetteSessionSerializer(many=True)
    production_par_produit = ProductionProduitSerializer(many=True)
    budget_par_categorie = BudgetCategorieSerializer(many=True)


class TableauDeBordSerializer(serializers.Serializer):
    mois = serializers.CharField()
    indicateurs = IndicateursSerializer()
    graphiques = GraphiquesSerializer()


def _mois(request: Request) -> date:
    texte = request.query_params.get("mois") or f"{timezone.localdate():%Y-%m}"
    try:
        return datetime.strptime(texte, "%Y-%m").date()  # noqa: DTZ007
    except ValueError:
        raise ValidationError({"mois": "AAAA-MM attendu."}) from None


def _indicateurs(debut: date, fin: date) -> dict[str, Any]:
    recette = (
        Encaissement.objects.filter(
            caisse__jour__gte=debut,
            caisse__jour__lt=fin,
        ).aggregate(total=Sum("montant"))["total"]
        or 0
    )
    ventes = (
        Livraison.objects.filter(
            statut="livree",
            caisse__jour__gte=debut,
            caisse__jour__lt=fin,
        ).aggregate(total=Sum("montant_du"))["total"]
        or 0
    )
    du_fournisseurs = (
        FactureFournisseur.objects.exclude(statut="payee").aggregate(
            total=Sum("montant"),
        )["total"]
        or 0
    )
    paye_fournisseurs = (
        PaiementFournisseur.objects.exclude(facture__statut="payee").aggregate(
            total=Sum("montant"),
        )["total"]
        or 0
    )
    ecart = (
        Caisse.objects.filter(jour__gte=debut, jour__lt=fin).aggregate(
            total=Sum("ecart"),
        )["total"]
        or 0
    )
    return {
        "recette": recette,
        "ventes": ventes,
        "taux_encaissement": taux_encaissement(recette, ventes),
        "dettes_clients": -sum(solde for _, solde in debiteurs()),
        "dettes_fournisseurs": du_fournisseurs - paye_fournisseurs,
        "ecart_caisse_cumule": ecart,
    }


def _graphiques(debut: date, fin: date) -> dict[str, Any]:
    recettes = (
        Encaissement.objects.filter(caisse__jour__gte=debut, caisse__jour__lt=fin)
        .values("caisse__jour", "caisse__creneau")
        .annotate(recette=Sum("montant"))
        .order_by("caisse__jour", "caisse__creneau")
    )
    production = (
        Fournee.objects.filter(
            production__plan__jour__gte=debut,
            production__plan__jour__lt=fin,
        )
        .values("produit__code", "produit__ordre")
        .annotate(pains=Sum("pains"))
        .order_by("produit__ordre")
    )
    budget = budget_du_mois(debut)
    return {
        "recette_par_session": [
            {
                "jour": ligne["caisse__jour"],
                "creneau": ligne["caisse__creneau"],
                "recette": ligne["recette"],
            }
            for ligne in recettes
        ],
        "production_par_produit": [
            {"code": ligne["produit__code"], "pains": ligne["pains"]}
            for ligne in production
        ],
        "budget_par_categorie": [
            {
                "categorie": ligne["categorie"],
                "budget": ligne["budget"],
                "depense": ligne["depense"],
            }
            for ligne in budget["lignes"]
        ],
    }


@extend_schema(
    parameters=[OpenApiParameter("mois", str, description="AAAA-MM ; ce mois-ci")],
    responses=TableauDeBordSerializer,
)
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def tableau_de_bord(request: Request) -> Response:
    """Recette, taux d'encaissement, dettes, écart de caisse et graphiques du mois."""
    debut, fin = bornes_du_mois(_mois(request))
    return Response(
        TableauDeBordSerializer(
            {
                "mois": f"{debut:%Y-%m}",
                "indicateurs": _indicateurs(debut, fin),
                "graphiques": _graphiques(debut, fin),
            },
        ).data,
    )
