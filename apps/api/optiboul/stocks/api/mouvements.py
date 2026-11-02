"""Registre du stock (US-091, CdC §5.6) : mouvements et stock par matière."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.stocks.application import saisies as cas
from optiboul.stocks.domain.etat import StatutStock
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.infrastructure.a_date import stock_du_soir
from optiboul.stocks.infrastructure.etat import etat_du_stock
from optiboul.stocks.infrastructure.models import MouvementStock
from optiboul.stocks.infrastructure.saisies import depots
from optiboul.stocks.infrastructure.stocks import stock

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class MouvementStockSerializer(serializers.ModelSerializer[MouvementStock]):
    matiere = serializers.CharField(source="matiere.code")
    auteur = serializers.CharField(source="auteur.name")

    class Meta:
        model = MouvementStock
        fields = [
            "id",
            "matiere",
            "sens",
            "quantite",
            "genre",
            "source_type",
            "source_id",
            "motif",
            "semaine",
            "auteur",
            "cree_le",
        ]
        read_only_fields = fields


class StockSerializer(serializers.Serializer):
    quantites = serializers.DictField(
        child=serializers.DecimalField(max_digits=14, decimal_places=3),
        help_text="Code de la matière → stock, dans l'unité de la matière.",
    )


class LigneEtatSerializer(serializers.Serializer):
    matiere = serializers.CharField()
    nom = serializers.CharField()
    unite = serializers.CharField()
    quantite = serializers.DecimalField(max_digits=14, decimal_places=3)
    besoin_par_session = serializers.DecimalField(max_digits=14, decimal_places=3)
    sessions_restantes = serializers.DecimalField(
        max_digits=8,
        decimal_places=1,
        allow_null=True,
    )
    prochaine_reception = serializers.DateField(allow_null=True)
    valeur = serializers.IntegerField(help_text="En FCFA.")
    statut = serializers.ChoiceField(choices=[s.value for s in StatutStock])


class DernierComptageSerializer(serializers.Serializer):
    jour = serializers.DateField()
    quantite = serializers.DecimalField(max_digits=14, decimal_places=3)


class LigneADateSerializer(serializers.Serializer):
    matiere = serializers.CharField()
    nom = serializers.CharField()
    unite = serializers.CharField()
    stock = serializers.DecimalField(max_digits=14, decimal_places=3)
    entrees = serializers.DecimalField(max_digits=14, decimal_places=3)
    sorties = serializers.DecimalField(max_digits=14, decimal_places=3)
    ajustements = serializers.DecimalField(max_digits=14, decimal_places=3)
    dernier_comptage = DernierComptageSerializer(allow_null=True)


class StockADateRequeteSerializer(serializers.Serializer):
    date = serializers.DateField()


class SaisieStockSerializer(serializers.Serializer):
    matiere = serializers.CharField(max_length=30)
    quantite = serializers.DecimalField(max_digits=12, decimal_places=3)
    genre = serializers.ChoiceField(
        choices=[GenreMouvementStock.PERTE.value, GenreMouvementStock.CORRECTION.value],
    )
    sens = serializers.ChoiceField(
        choices=[(Sens.SORTIE.value, "sortie"), (Sens.ENTREE.value, "entrée")],
        default=Sens.SORTIE.value,
    )
    motif = serializers.CharField(max_length=255, allow_blank=True)


class SaisieEnregistreeSerializer(serializers.Serializer):
    numero = serializers.IntegerField()


class MouvementsStockViewSet(ListModelMixin, GenericViewSet):
    """Entrées et sorties, liées à leur origine (production, réception…)."""

    serializer_class = MouvementStockSerializer
    permission_classes = [ProfilParmi("production", *DIRECTION)]
    queryset = MouvementStock.objects.select_related("matiere", "auteur").order_by(
        "-cree_le",
        "-id",
    )

    def get_queryset(self) -> QuerySet[MouvementStock]:
        mouvements = super().get_queryset()
        filtres = {"matiere": "matiere__code", "source_type": "source_type"}
        for parametre, champ in filtres.items():
            if valeur := self.request.query_params.get(parametre):
                mouvements = mouvements.filter(**{champ: valeur})
        if source := self.request.query_params.get("source_id"):
            mouvements = mouvements.filter(source_id=source)
        return mouvements

    @extend_schema(
        parameters=[
            OpenApiParameter("matiere", str),
            OpenApiParameter("source_type", str),
            OpenApiParameter("source_id", int),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=StockSerializer)
    @action(detail=False)
    def stock(self, request: Request) -> Response:
        """Stock actuel de chaque matière suivie : somme de ses mouvements."""
        return Response(StockSerializer({"quantites": stock.quantites()}).data)

    @extend_schema(responses=LigneEtatSerializer(many=True))
    @action(detail=False)
    def etat(self, request: Request) -> Response:
        """Par matière : besoin, sessions restantes, valeur et statut (US-090)."""
        return Response(LigneEtatSerializer(etat_du_stock(), many=True).data)

    @extend_schema(
        parameters=[OpenApiParameter("date", str, required=True)],
        responses=LigneADateSerializer(many=True),
    )
    @action(detail=False, url_path="stock-a-date", url_name="stock-a-date")
    def stock_a_date(self, request: Request) -> Response:
        """Stock au soir du jour demandé, avec le détail du jour (US-094)."""
        requete = StockADateRequeteSerializer(data=request.query_params)
        requete.is_valid(raise_exception=True)
        lignes = stock_du_soir(requete.validated_data["date"])
        return Response(LigneADateSerializer(lignes, many=True).data)

    @extend_schema(
        request=SaisieStockSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: SaisieEnregistreeSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    @idempotent
    def saisir(self, request: Request) -> Response:
        """Perte, casse ou correction : le motif est obligatoire (US-092)."""
        corps = SaisieStockSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        try:
            numero = cas.saisir(
                depots,
                matiere=donnees["matiere"],
                quantite=donnees["quantite"],
                genre=GenreMouvementStock(donnees["genre"]),
                sens=Sens(donnees["sens"]),
                motif=donnees["motif"],
                auteur=auteur_de(request),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response({"numero": numero}, status=status.HTTP_201_CREATED)
