"""Fiches clients et tarifs (US-060, CdC §5.4)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import Case
from django.db.models import Exists
from django.db.models import IntegerField
from django.db.models import Max
from django.db.models import OuterRef
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

from optiboul.clients.domain.clients import StatutDette
from optiboul.clients.domain.clients import jauge
from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.clients import prix_du_client
from optiboul.clients.domain.clients import statut_dette
from optiboul.clients.domain.clients import telephone_du_client
from optiboul.clients.infrastructure.comptes import SOLDE
from optiboul.clients.infrastructure.comptes import solde_de
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import ReportDette
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
    solde = serializers.SerializerMethodField()
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
            "solde",
            "actif",
            "tarifs",
            "prix",
        ]
        read_only_fields = ["id", "plafond_effectif", "solde", "tarifs", "prix"]

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

    def get_solde(self, client: Client) -> int:
        """Somme des mouvements du compte, en FCFA ; négatif : dette (R21)."""
        solde = getattr(client, "solde", None)
        return solde_de(client.pk) if solde is None else int(solde)

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


class DetteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField()
    type = serializers.CharField()
    telephone = serializers.CharField()
    solde = serializers.IntegerField()
    plafond = serializers.IntegerField()
    jauge = serializers.IntegerField(help_text="Part du plafond utilisée, en %.")
    statut = serializers.ChoiceField(choices=[s.value for s in StatutDette])
    reportee = serializers.BooleanField(
        help_text="Dette reportée d'une semaine close (R20).",
    )
    derniere_livraison = serializers.DateTimeField(allow_null=True)


class DettesSerializer(serializers.Serializer):
    nombre = serializers.IntegerField()
    total = serializers.IntegerField(help_text="Total dû par les clients, en FCFA.")
    clients = DetteSerializer(many=True)


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
    queryset = Client.objects.prefetch_related("tarifs__produit").annotate(solde=SOLDE)
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve", "dettes"}:
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
        parameters=[
            OpenApiParameter("statut", str, enum=[s.value for s in StatutDette]),
        ],
        responses=DettesSerializer,
    )
    @action(detail=False)
    def dettes(self, request: Request) -> Response:
        """Clients qui doivent de l'argent, la plus grosse dette d'abord (R21)."""
        plafond_general = parametre("plafond_dette_client")
        masquer = profil_de(request) not in DIRECTION
        debiteurs = (
            Client.objects.annotate(
                solde=SOLDE,
                derniere_livraison=Max("livraisons__cree_le"),
                reportee=Exists(ReportDette.objects.filter(client=OuterRef("pk"))),
            )
            .filter(solde__lt=0)
            .order_by("solde", "nom")
        )
        lignes = []
        for client in debiteurs:
            plafond = plafond_du_client(client.plafond, plafond_general)
            statut = statut_dette(client.solde, plafond)
            if request.query_params.get("statut") not in {None, "", statut}:
                continue
            telephone = client.telephone
            if masquer and telephone:
                telephone = masquer_telephone(telephone)
            lignes.append(
                {
                    "id": client.pk,
                    "nom": client.nom,
                    "type": client.type,
                    "telephone": telephone,
                    "solde": client.solde,
                    "plafond": plafond,
                    "jauge": jauge(client.solde, plafond),
                    "statut": statut,
                    "reportee": client.reportee,
                    "derniere_livraison": client.derniere_livraison,
                },
            )
        return Response(
            DettesSerializer(
                {
                    "nombre": len(lignes),
                    "total": -sum(ligne["solde"] for ligne in lignes),
                    "clients": lignes,
                },
            ).data,
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
