"""Livraisons (US-051, CdC §5.3) : livrer comme commandé, au tarif du client."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.application import livraisons as cas
from optiboul.ventes.application.livraisons import LIVRENT
from optiboul.ventes.infrastructure.livraisons import depots
from optiboul.ventes.infrastructure.models import Livraison

from .commandes import ClientResumeSerializer
from .encaissements import PaiementSerializer
from .encaissements import paiement_de

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class LigneLivreeSerializer(serializers.Serializer):
    code = serializers.CharField()
    quantite = serializers.IntegerField()
    prix_unitaire = serializers.IntegerField()
    montant = serializers.IntegerField()


class LivraisonSerializer(serializers.ModelSerializer[Livraison]):
    client = ClientResumeSerializer()
    jour = serializers.DateField(source="caisse.jour")
    creneau = serializers.CharField(source="caisse.creneau")
    lignes = serializers.SerializerMethodField()
    recu = serializers.SerializerMethodField()
    reste = serializers.SerializerMethodField()
    paiements = serializers.SerializerMethodField()
    cree_par = serializers.CharField(source="cree_par.name")

    class Meta:
        model = Livraison
        fields = [
            "id",
            "numero",
            "caisse",
            "jour",
            "creneau",
            "client",
            "commande",
            "statut",
            "lignes",
            "montant_du",
            "recu",
            "reste",
            "paiements",
            "solde_avant",
            "solde_apres",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields

    @extend_schema(responses=LigneLivreeSerializer(many=True))
    def get_lignes(self, livraison: Livraison) -> list[dict[str, Any]]:
        return [
            {
                "code": ligne.produit.code,
                "quantite": ligne.quantite,
                "prix_unitaire": ligne.prix_unitaire,
                "montant": ligne.montant,
            }
            for ligne in livraison.lignes.all()
        ]

    def get_recu(self, livraison: Livraison) -> int:
        return sum(e.montant for e in livraison.encaissements.all())

    def get_reste(self, livraison: Livraison) -> int:
        """Reçu moins dû : négatif, nouvelle dette ; positif, dette remboursée."""
        return self.get_recu(livraison) - livraison.montant_du

    @extend_schema(responses=PaiementSerializer(many=True))
    def get_paiements(self, livraison: Livraison) -> list[dict[str, Any]]:
        return [
            {"mode": e.mode, "montant": e.montant, "reference": e.reference}
            for e in livraison.encaissements.all()
        ]


class NouvelleLivraisonSerializer(serializers.Serializer):
    client = serializers.IntegerField()
    lignes = serializers.DictField(
        child=serializers.IntegerField(min_value=0),
        help_text="Code du produit → pains livrés.",
    )
    paiement = PaiementSerializer(required=False, allow_null=True)


class ClientALivrerSerializer(serializers.Serializer):
    client = serializers.IntegerField()


class LivrerCommeCommandeSerializer(ClientALivrerSerializer):
    paiement = PaiementSerializer(required=False, allow_null=True)


class PropositionSerializer(serializers.Serializer):
    client = serializers.IntegerField()
    commande = serializers.IntegerField(allow_null=True)
    lignes = LigneLivreeSerializer(many=True)
    montant_du = serializers.IntegerField()
    solde = serializers.IntegerField()
    solde_apres = serializers.IntegerField()
    plafond = serializers.IntegerField()


def _ligne(ligne: Any) -> dict[str, Any]:
    return {
        "code": ligne.code,
        "quantite": ligne.quantite,
        "prix_unitaire": ligne.prix_unitaire,
        "montant": ligne.montant,
    }


class LivraisonsViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """Une caissière ne voit que les livraisons de ses caisses (CdC §5.2)."""

    serializer_class = LivraisonSerializer
    queryset = Livraison.objects.select_related(
        "client",
        "caisse",
        "cree_par",
    ).prefetch_related("lignes__produit", "encaissements")

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi("caissier", *DIRECTION)()]
        return [ProfilParmi(*LIVRENT)()]

    def get_queryset(self) -> QuerySet[Livraison]:
        livraisons = super().get_queryset()
        if profil_de(self.request) == "caissier":
            livraisons = livraisons.filter(caisse__caissiere_id=self.request.user.pk)
        if self.action == "list":
            for filtre in ("caisse", "client"):
                if valeur := self.request.query_params.get(filtre):
                    livraisons = livraisons.filter(**{f"{filtre}_id": valeur})
        return livraisons

    @extend_schema(
        parameters=[OpenApiParameter("caisse", int), OpenApiParameter("client", int)],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def _repondre(self, livraison: cas.EtatLivraison) -> Response:
        return Response(
            LivraisonSerializer(self.get_queryset().get(pk=livraison.id)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=NouvelleLivraisonSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: LivraisonSerializer, 409: ProblemeSerializer},
    )
    @idempotent
    def create(self, request: Request) -> Response:
        """Livraison sur la caisse en cours ; le compte du client est débité."""
        corps = NouvelleLivraisonSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                livraison = cas.livrer(
                    depots,
                    client_id=corps.validated_data["client"],
                    quantites=corps.validated_data["lignes"],
                    paiement=paiement_de(corps.validated_data.get("paiement")),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return self._repondre(livraison)

    @extend_schema(
        request=LivrerCommeCommandeSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: LivraisonSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"], url_path="livrer-comme-commande")
    @idempotent
    def livrer_comme_commande(self, request: Request) -> Response:
        """« Livrer comme commandé » en une touche (O3)."""
        corps = LivrerCommeCommandeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                livraison = cas.livrer_comme_commande(
                    depots,
                    client_id=corps.validated_data["client"],
                    paiement=paiement_de(corps.validated_data.get("paiement")),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return self._repondre(livraison)

    @extend_schema(
        parameters=[OpenApiParameter("client", int, required=True)],
        responses={200: PropositionSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False)
    def proposition(self, request: Request) -> Response:
        """Quantités commandées, prix du client, montant dû et solde après livraison."""
        parametres = ClientALivrerSerializer(data=request.query_params)
        parametres.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                proposee = cas.proposition(
                    depots,
                    client_id=parametres.validated_data["client"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            PropositionSerializer(
                {
                    **vars(proposee),
                    "lignes": [_ligne(ligne) for ligne in proposee.lignes],
                },
            ).data,
        )
