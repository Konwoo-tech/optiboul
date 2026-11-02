"""Mouvements internes (US-055, CdC §5.3) : pains sortis hors livraison, motivés."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.application import livraisons as cas
from optiboul.ventes.application.livraisons import LIVRENT
from optiboul.ventes.domain.livraisons import StatutLivraison
from optiboul.ventes.domain.mouvements import GenreMouvementInterne
from optiboul.ventes.domain.mouvements import MouvementInterne
from optiboul.ventes.domain.mouvements import totaux
from optiboul.ventes.infrastructure.livraisons import depot_mouvements_internes
from optiboul.ventes.infrastructure.livraisons import depots
from optiboul.ventes.infrastructure.models import LigneLivraison
from optiboul.ventes.infrastructure.models import MouvementInterne as MouvementModele

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

Pains = serializers.DictField(child=serializers.IntegerField())


class MouvementInterneSerializer(serializers.ModelSerializer[MouvementModele]):
    produit = serializers.CharField(source="produit.code")
    cree_par = serializers.CharField(source="cree_par.name")

    class Meta:
        model = MouvementModele
        fields = [
            "id",
            "caisse",
            "genre",
            "produit",
            "quantite",
            "motif",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields


class NouveauMouvementSerializer(serializers.Serializer):
    genre = serializers.ChoiceField(choices=[g.value for g in GenreMouvementInterne])
    produit = serializers.CharField(max_length=10)
    quantite = serializers.IntegerField(min_value=1)
    motif = serializers.CharField(max_length=500)


class TotauxSerializer(serializers.Serializer):
    caisse = serializers.IntegerField()
    livres = Pains
    vente_guichet = Pains
    retours = Pains
    reste_en_salle = Pains
    ration = Pains


class MouvementsInternesViewSet(ListModelMixin, GenericViewSet):
    """Une caissière ne voit que les mouvements de ses caisses (CdC §5.2)."""

    serializer_class = MouvementInterneSerializer
    queryset = MouvementModele.objects.select_related("produit", "cree_par")

    def get_permissions(self):
        if self.action in {"list", "totaux"}:
            return [ProfilParmi("caissier", *DIRECTION)()]
        return [ProfilParmi(*LIVRENT)()]

    def get_queryset(self) -> QuerySet[MouvementModele]:
        mouvements = super().get_queryset()
        if profil_de(self.request) == "caissier":
            mouvements = mouvements.filter(caisse__caissiere_id=self.request.user.pk)
        if caisse := self.request.query_params.get("caisse"):
            mouvements = mouvements.filter(caisse_id=caisse)
        return mouvements

    @extend_schema(parameters=[OpenApiParameter("caisse", int)])
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=NouveauMouvementSerializer,
        responses={201: MouvementInterneSerializer, 409: ProblemeSerializer},
    )
    def create(self, request: Request) -> Response:
        corps = NouveauMouvementSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        try:
            with transaction.atomic():
                mouvement_id = cas.enregistrer_mouvement_interne(
                    depots,
                    depot_mouvements_internes,
                    mouvement=MouvementInterne(
                        GenreMouvementInterne(donnees["genre"]),
                        donnees["produit"],
                        donnees["quantite"],
                        donnees["motif"],
                    ),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            MouvementInterneSerializer(self.get_queryset().get(pk=mouvement_id)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        parameters=[OpenApiParameter("caisse", int, required=True)],
        responses=TotauxSerializer,
    )
    @action(detail=False)
    def totaux(self, request: Request) -> Response:
        """Pains livrés et pains de chaque mouvement interne, par produit."""
        caisses = Caisse.objects.all()
        if profil_de(request) == "caissier":
            caisses = caisses.filter(caissiere_id=request.user.pk)
        caisse = caisses.filter(pk=request.query_params.get("caisse") or 0).first()
        if caisse is None:
            return probleme(RefusMetier("caisse_inconnue", "Caisse inconnue."))
        livres = dict(
            LigneLivraison.objects.filter(
                livraison__caisse=caisse,
                livraison__statut=StatutLivraison.LIVREE,
            )
            .values_list("produit__code")
            .annotate(pains=Sum("quantite"))
            .values_list("produit__code", "pains"),
        )
        par_genre = totaux(depot_mouvements_internes.de_la_caisse(caisse.pk))
        return Response(
            {
                "caisse": caisse.pk,
                "livres": livres,
                **{genre.value: pains for genre, pains in par_genre.items()},
            },
        )
