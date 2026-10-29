"""Fiches clients et tarifs (US-060, CdC §5.4)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import Case
from django.db.models import IntegerField
from django.db.models import Q
from django.db.models import Value
from django.db.models import When
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import mixins
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.clients import prix_du_client
from optiboul.clients.domain.clients import telephone_du_client
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import TarifClient
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.notifications.domain.envois import masquer_telephone
from optiboul.production.infrastructure.models import Produit

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

Prix = serializers.DictField(
    child=serializers.IntegerField(allow_null=True),
    help_text="Code du produit → prix en FCFA l'unité.",
)


class ClientSerializer(serializers.ModelSerializer[Client]):
    plafond_effectif = serializers.SerializerMethodField()
    tarifs = serializers.SerializerMethodField()
    prix = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id",
            "nom",
            "type",
            "telephone",
            "lieu",
            "plafond",
            "plafond_effectif",
            "actif",
            "tarifs",
            "prix",
        ]
        read_only_fields = ["id", "plafond_effectif", "tarifs", "prix"]

    def validate_telephone(self, telephone: str) -> str:
        try:
            return telephone_du_client(telephone)
        except RefusMetier as refus:
            raise serializers.ValidationError(refus.detail) from None

    def validate_nom(self, nom: str) -> str:
        if not nom.strip():
            message = "Le nom du client est obligatoire."
            raise serializers.ValidationError(message)
        return nom.strip()

    def get_plafond_effectif(self, client: Client) -> int:
        return plafond_du_client(client.plafond, parametre("plafond_dette_client"))

    @extend_schema(responses=Prix)
    def get_tarifs(self, client: Client) -> dict[str, int]:
        """Prix propres au client, produit par produit."""
        return {t.produit.code: t.prix for t in client.tarifs.all()}

    @extend_schema(responses=Prix)
    def get_prix(self, client: Client) -> dict[str, int | None]:
        """Prix appliqués à la livraison : le tarif du client, sinon le prix de base."""
        tarifs = {t.produit_id: t.prix for t in client.tarifs.all()}
        return {
            produit.code: prix_du_client(tarifs.get(produit.pk), produit.prix)
            for produit in self.context.get("produits", [])
        }

    def to_representation(self, instance: Client) -> dict[str, Any]:
        donnees = super().to_representation(instance)
        # Téléphones masqués à l'affichage (spécification §7) ; la direction les gère.
        if self.context.get("masquer") and donnees["telephone"]:
            donnees["telephone"] = masquer_telephone(donnees["telephone"])
        return donnees


class TarifsSerializer(serializers.Serializer):
    tarifs = serializers.DictField(
        child=serializers.IntegerField(min_value=0, allow_null=True),
        help_text="Code du produit → prix en FCFA ; null retire le tarif propre.",
    )


def _valeurs(client: Client) -> dict[str, Any]:
    return {
        champ: getattr(client, champ)
        for champ in ("nom", "type", "telephone", "lieu", "plafond", "actif")
    }


def rechercher(clients: QuerySet[Client], texte: str) -> QuerySet[Client]:
    """Par les premières lettres du nom ou d'un de ses mots ; le début du nom avant."""
    texte = texte.strip()
    if not texte:
        return clients
    debut_de_mot = rf"(^|\s){re.escape(texte)}"
    return (
        clients.filter(Q(nom__istartswith=texte) | Q(nom__iregex=debut_de_mot))
        .annotate(
            rang=Case(
                When(nom__istartswith=texte, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            ),
        )
        .order_by("rang", "nom", "id")
    )


class ClientsViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """La caisse lit les clients ; le gérant et le propriétaire les gèrent."""

    serializer_class = ClientSerializer
    queryset = Client.objects.prefetch_related("tarifs__produit")
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi("caissier", *DIRECTION)()]
        return [ProfilParmi(*DIRECTION)()]

    def get_serializer_context(self) -> dict[str, Any]:
        return {
            **super().get_serializer_context(),
            "produits": list(Produit.objects.filter(actif=True)),
            "masquer": profil_de(self.request) not in DIRECTION,
        }

    @extend_schema(
        parameters=[
            OpenApiParameter("recherche", str, description="Premières lettres du nom"),
            OpenApiParameter("actif", bool),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    def get_queryset(self) -> QuerySet[Client]:
        clients = super().get_queryset()
        if self.action != "list":
            return clients
        actif = self.request.query_params.get("actif")
        if actif is not None:
            clients = clients.filter(actif=actif.lower() in {"1", "true", "oui"})
        return rechercher(clients, self.request.query_params.get("recherche", ""))

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        client = serializer.save()
        journaliser(
            "client.cree",
            auteur=auteur_de(self.request),
            objet_type="client",
            objet_id=client.pk,
            apres=_valeurs(client),
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        assert serializer.instance is not None
        avant = _valeurs(serializer.instance)
        client = serializer.save()
        journaliser(
            "client.modifie",
            auteur=auteur_de(self.request),
            objet_type="client",
            objet_id=client.pk,
            avant=avant,
            apres=_valeurs(client),
        )

    @extend_schema(
        request=TarifsSerializer,
        responses={200: ClientSerializer, 400: ProblemeSerializer},
    )
    @action(detail=True, methods=["put"])
    def tarifs(self, request: Request, pk: str) -> Response:
        """Tarif par produit : un prix fixe le tarif propre, null le retire."""
        client = self.get_object()
        corps = TarifsSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        demandes: dict[str, int | None] = corps.validated_data["tarifs"]
        produits = {p.code: p for p in Produit.objects.filter(code__in=demandes)}
        if inconnus := sorted(set(demandes) - set(produits)):
            refus = RefusMetier(
                "produit_inconnu",
                f"Produits inconnus : {', '.join(inconnus)}.",
                produits=inconnus,
            )
            return probleme(refus)
        avant = {t.produit.code: t.prix for t in client.tarifs.all()}
        with transaction.atomic():
            for code, prix in demandes.items():
                if prix is None:
                    TarifClient.objects.filter(
                        client=client,
                        produit=produits[code],
                    ).delete()
                else:
                    TarifClient.objects.update_or_create(
                        client=client,
                        produit=produits[code],
                        defaults={"prix": prix},
                    )
            apres = dict(
                TarifClient.objects.filter(client=client).values_list(
                    "produit__code",
                    "prix",
                ),
            )
            if apres != avant:
                journaliser(
                    "client.tarifs",
                    auteur=auteur_de(request),
                    objet_type="client",
                    objet_id=client.pk,
                    avant=avant,
                    apres=apres,
                )
        client = self.get_queryset().get(pk=client.pk)
        return Response(self.get_serializer(client).data)
