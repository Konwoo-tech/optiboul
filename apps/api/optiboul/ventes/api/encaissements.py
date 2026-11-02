"""Encaissements (US-052, CdC §5.3) : espèces, MTN MoMo, Orange Money (R7)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
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
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.application import livraisons as cas
from optiboul.ventes.application.livraisons import LIVRENT
from optiboul.ventes.domain.encaissements import ModePaiement
from optiboul.ventes.domain.encaissements import Paiement
from optiboul.ventes.infrastructure.livraisons import depots
from optiboul.ventes.infrastructure.models import MODES_PAIEMENT
from optiboul.ventes.infrastructure.models import Encaissement

from .commandes import ClientResumeSerializer

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class PaiementSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=MODES_PAIEMENT)
    montant = serializers.IntegerField(min_value=0)
    reference = serializers.CharField(
        max_length=60,
        allow_blank=True,
        required=False,
        default="",
        help_text="Référence de la transaction, obligatoire en mobile money (R7).",
    )

    def paiement(self) -> Paiement:
        donnees = self.validated_data
        return Paiement(
            ModePaiement(donnees["mode"]),
            donnees["montant"],
            donnees["reference"],
        )


def paiement_de(donnees: dict[str, Any] | None) -> Paiement | None:
    if not donnees:
        return None
    return Paiement(
        ModePaiement(donnees["mode"]),
        donnees["montant"],
        donnees["reference"],
    )


class EncaissementSerializer(serializers.ModelSerializer[Encaissement]):
    client = ClientResumeSerializer()
    cree_par = serializers.CharField(source="cree_par.name")

    class Meta:
        model = Encaissement
        fields = [
            "id",
            "caisse",
            "client",
            "livraison",
            "mode",
            "montant",
            "reference",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields


class NouvelEncaissementSerializer(PaiementSerializer):
    client = serializers.IntegerField()


class EncaissementEnregistreSerializer(EncaissementSerializer):
    solde_avant = serializers.SerializerMethodField()
    solde_apres = serializers.SerializerMethodField()

    class Meta(EncaissementSerializer.Meta):
        fields = [*EncaissementSerializer.Meta.fields, "solde_avant", "solde_apres"]
        read_only_fields = fields

    def get_solde_avant(self, encaissement: Encaissement) -> int:
        return self.context["etat"].solde_avant

    def get_solde_apres(self, encaissement: Encaissement) -> int:
        return self.context["etat"].solde_apres


class EncaissementsViewSet(ListModelMixin, GenericViewSet):
    """Une caissière ne voit que les encaissements de ses caisses (CdC §5.2)."""

    serializer_class = EncaissementSerializer
    queryset = Encaissement.objects.select_related("client", "cree_par")

    def get_permissions(self):
        if self.action == "list":
            return [ProfilParmi("caissier", *DIRECTION)()]
        return [ProfilParmi(*LIVRENT)()]

    def get_queryset(self) -> QuerySet[Encaissement]:
        encaissements = super().get_queryset()
        if profil_de(self.request) == "caissier":
            encaissements = encaissements.filter(
                caisse__caissiere_id=self.request.user.pk,
            )
        for filtre in ("caisse", "client"):
            if valeur := self.request.query_params.get(filtre):
                encaissements = encaissements.filter(**{f"{filtre}_id": valeur})
        return encaissements

    @extend_schema(
        parameters=[OpenApiParameter("caisse", int), OpenApiParameter("client", int)],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=NouvelEncaissementSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: EncaissementEnregistreSerializer, 409: ProblemeSerializer},
    )
    @idempotent
    def create(self, request: Request) -> Response:
        """Paiement sans livraison : rembourse une ancienne dette, même en partie."""
        corps = NouvelEncaissementSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                etat = cas.encaisser(
                    depots,
                    client_id=corps.validated_data["client"],
                    paiement=corps.paiement(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            EncaissementEnregistreSerializer(
                self.get_queryset().get(pk=etat.id),
                context={"etat": etat},
            ).data,
            status=status.HTTP_201_CREATED,
        )
