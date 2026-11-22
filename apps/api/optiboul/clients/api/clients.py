"""Fiches clients et tarifs (US-060, CdC §5.4)."""

from __future__ import annotations

import re
from datetime import timedelta
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
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import mixins
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
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
from optiboul.clients.infrastructure.models import Relance
from optiboul.clients.infrastructure.models import ReportDette
from optiboul.clients.infrastructure.models import TarifClient
from optiboul.clients.infrastructure.relances import relancer_dettes
from optiboul.clients.infrastructure.releves import envoyer as envoyer_le_releve
from optiboul.clients.infrastructure.releves import pdf as pdf_releve
from optiboul.clients.infrastructure.releves import releve_de
from optiboul.clients.infrastructure.reprise import importer as importer_classeur
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
    from collections.abc import Sequence
    from datetime import date

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


class ClientResumeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField()


class EtatEnvoiSerializer(serializers.Serializer):
    statut = serializers.CharField(help_text="en_attente, envoye ou echec (O15).")
    envoye_le = serializers.DateTimeField(allow_null=True)


class RelanceSerializer(serializers.ModelSerializer[Relance]):
    client = serializers.SerializerMethodField()
    auteur = serializers.SerializerMethodField()
    envoi = serializers.SerializerMethodField()

    class Meta:
        model = Relance
        fields = [
            "id",
            "client",
            "motif",
            "montant",
            "automatique",
            "auteur",
            "cree_le",
            "envoi",
        ]
        read_only_fields = fields

    @extend_schema(responses=ClientResumeSerializer)
    def get_client(self, relance: Relance) -> dict[str, Any]:
        return {"id": relance.client_id, "nom": relance.client.nom}

    def get_auteur(self, relance: Relance) -> str:
        return relance.auteur.name if relance.auteur else "Automatique"

    @extend_schema(responses=EtatEnvoiSerializer)
    def get_envoi(self, relance: Relance) -> dict[str, Any]:
        return {
            "statut": relance.message.statut,
            "envoye_le": relance.message.envoye_le,
        }


RAISONS_IGNOREES = ["sans_telephone", "sans_dette"]


class IgnoreSerializer(serializers.Serializer):
    client = serializers.IntegerField()
    nom = serializers.CharField()
    raison = serializers.ChoiceField(choices=RAISONS_IGNOREES)


class ResultatRelanceSerializer(serializers.Serializer):
    relances = RelanceSerializer(many=True)
    ignores = IgnoreSerializer(many=True)


class RelanceGroupeeSerializer(serializers.Serializer):
    clients = serializers.ListField(child=serializers.IntegerField(), min_length=1)


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
    derniere_relance = RelanceSerializer(allow_null=True)


class DettesSerializer(serializers.Serializer):
    nombre = serializers.IntegerField()
    total = serializers.IntegerField(help_text="Total dû par les clients, en FCFA.")
    clients = DetteSerializer(many=True)


DUREE_RELEVE_JOURS = 30


class PeriodeSerializer(serializers.Serializer):
    du = serializers.DateField(required=False)
    au = serializers.DateField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        """Par défaut, les 30 derniers jours."""
        au = attrs.get("au") or timezone.localdate()
        du = attrs.get("du") or au - timedelta(days=DUREE_RELEVE_JOURS)
        if du > au:
            message = "La date de début suit la date de fin."
            raise serializers.ValidationError(message)
        return {"du": du, "au": au}


class LigneReleveSerializer(serializers.Serializer):
    jour = serializers.DateField()
    libelle = serializers.CharField()
    debit = serializers.IntegerField()
    credit = serializers.IntegerField()
    solde = serializers.IntegerField()


class ReleveSerializer(serializers.Serializer):
    solde_initial = serializers.IntegerField()
    lignes = LigneReleveSerializer(many=True)
    solde_final = serializers.IntegerField()


class ImportClasseurSerializer(serializers.Serializer):
    fichier = serializers.FileField(help_text="Feuilles « Clients » et « Tarifs ».")
    confirmer = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Faux par défaut : simulation, rien n'est gardé.",
    )


class RejetSerializer(serializers.Serializer):
    feuille = serializers.CharField()
    ligne = serializers.IntegerField()
    raison = serializers.CharField()


class DettePlafondSerializer(serializers.Serializer):
    nom = serializers.CharField()
    dette = serializers.IntegerField()
    plafond = serializers.IntegerField()


class RapportImportSerializer(serializers.Serializer):
    simulation = serializers.BooleanField()
    clients = serializers.IntegerField()
    tarifs = serializers.IntegerField()
    soldes = serializers.IntegerField()
    rejets = RejetSerializer(many=True)
    dettes_au_dela_du_plafond = DettePlafondSerializer(many=True)


class TarifsSerializer(serializers.Serializer):
    tarifs = serializers.DictField(
        child=serializers.IntegerField(min_value=0, allow_null=True),
        help_text="Code du produit → prix en FCFA ; null retire le tarif propre.",
    )


class ClientEcritureSerializer(ClientSerializer):
    """Corps de création et de modification : `tarifs` s'applique aussi (#309)."""

    tarifs = serializers.DictField(  # type: ignore[assignment]
        child=serializers.IntegerField(min_value=0, allow_null=True),
        required=False,
        write_only=True,
        help_text="Code du produit → prix en FCFA ; null retire le tarif propre.",
    )

    class Meta(ClientSerializer.Meta):
        read_only_fields = ["id", "plafond_effectif", "solde", "prix"]

    def create(self, validated_data: dict[str, Any]) -> Client:
        validated_data.pop("tarifs", None)
        return super().create(validated_data)

    def update(self, instance: Client, validated_data: dict[str, Any]) -> Client:
        validated_data.pop("tarifs", None)
        return super().update(instance, validated_data)

    def to_representation(self, instance: Client) -> dict[str, Any]:
        """La réponse est celle de la lecture, tarifs appliqués compris."""
        return ClientSerializer(instance, context=self.context).to_representation(
            instance,
        )


def appliquer_tarifs(client: Client, demandes: dict[str, int | None]) -> None:
    """Un prix fixe le tarif propre, null le retire ; un produit inconnu refuse tout."""
    produits = {p.code: p for p in Produit.objects.filter(code__in=demandes)}
    if inconnus := sorted(set(demandes) - set(produits)):
        message = f"Produits inconnus : {', '.join(inconnus)}."
        refus = RefusMetier("produit_inconnu", message, produits=inconnus)
        raise refus
    for code, prix in demandes.items():
        if prix is None:
            TarifClient.objects.filter(client=client, produit=produits[code]).delete()
        else:
            TarifClient.objects.update_or_create(
                client=client,
                produit=produits[code],
                defaults={"prix": prix},
            )


def tarifs_de(client: Client) -> dict[str, int]:
    return dict(
        TarifClient.objects.filter(client=client).values_list("produit__code", "prix"),
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
        if self.action in {
            "list",
            "retrieve",
            "dettes",
            "releve",
            "releve_pdf",
            "envoyer_releve",
        }:
            return [ProfilParmi("caissier", *DIRECTION)()]
        if self.action == "importer":
            return [ProfilParmi("administrateur")()]
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

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return ClientEcritureSerializer
        return super().get_serializer_class()

    @extend_schema(
        request=ClientEcritureSerializer,
        responses={201: ClientSerializer, 400: ProblemeSerializer},
    )
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except RefusMetier as refus:
            return probleme(refus)

    @extend_schema(
        request=ClientEcritureSerializer,
        responses={200: ClientSerializer, 400: ProblemeSerializer},
    )
    def update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        try:
            with transaction.atomic():
                return super().update(request, *args, **kwargs)
        except RefusMetier as refus:
            return probleme(refus)

    @extend_schema(
        request=ClientEcritureSerializer,
        responses={200: ClientSerializer, 400: ProblemeSerializer},
    )
    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().partial_update(request, *args, **kwargs)

    def _enregistrer(self, serializer: serializers.BaseSerializer) -> Client:
        tarifs = serializer.validated_data.get("tarifs")
        client = serializer.save()
        if tarifs is not None:
            appliquer_tarifs(client, tarifs)
        return client

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        client = self._enregistrer(serializer)
        journaliser(
            "client.cree",
            auteur=auteur_de(self.request),
            objet_type="client",
            objet_id=client.pk,
            apres={**_valeurs(client), "tarifs": tarifs_de(client)},
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        assert serializer.instance is not None
        avant = {
            **_valeurs(serializer.instance),
            "tarifs": tarifs_de(serializer.instance),
        }
        client = self._enregistrer(serializer)
        journaliser(
            "client.modifie",
            auteur=auteur_de(self.request),
            objet_type="client",
            objet_id=client.pk,
            avant=avant,
            apres={**_valeurs(client), "tarifs": tarifs_de(client)},
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
        relances: dict[int, Relance] = {}
        for relance in (
            Relance.objects.filter(motif="dette")
            .select_related(
                "client",
                "auteur",
                "message",
            )
            .order_by("cree_le", "id")
        ):
            relances[relance.client_id] = relance
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
                    "derniere_relance": relances.get(client.pk),
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

    def _relancer(self, request: Request, clients: Sequence[Client]) -> Response:
        with transaction.atomic():
            resultat = relancer_dettes([*clients], auteur=auteur_de(request))
        return Response(
            ResultatRelanceSerializer(
                {
                    "relances": resultat.relances,
                    "ignores": [
                        {"client": client.pk, "nom": client.nom, "raison": raison}
                        for client, raison in resultat.ignores
                    ],
                },
            ).data,
        )

    @extend_schema(request=None, responses=ResultatRelanceSerializer)
    @action(detail=True, methods=["post"])
    def relancer(self, request: Request, pk: str) -> Response:
        """Relance WhatsApp de la dette du client, par la file d'envoi (O15)."""
        return self._relancer(request, [self.get_object()])

    @extend_schema(
        request=RelanceGroupeeSerializer,
        responses=ResultatRelanceSerializer,
    )
    @action(detail=False, methods=["post"], url_path="relancer-groupe")
    def relancer_groupe(self, request: Request) -> Response:
        """Relance groupée : chaque client qui doit et a un numéro reçoit un message."""
        corps = RelanceGroupeeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        clients = list(Client.objects.filter(pk__in=corps.validated_data["clients"]))
        return self._relancer(request, clients)

    @extend_schema(
        request={"multipart/form-data": ImportClasseurSerializer},
        responses={200: RapportImportSerializer, 400: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
    )
    def importer(self, request: Request) -> Response:
        """Reprise du classeur (US-150) : simuler, relire le rapport, confirmer."""
        corps = ImportClasseurSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        confirmer = corps.validated_data["confirmer"]
        try:
            rapport = importer_classeur(
                corps.validated_data["fichier"],
                confirmer=confirmer,
                auteur=auteur_de(request),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            RapportImportSerializer(
                {**vars(rapport), "simulation": not confirmer},
            ).data,
        )

    def _periode(self, donnees: Any) -> tuple[date, date]:
        periode = PeriodeSerializer(data=donnees)
        periode.is_valid(raise_exception=True)
        return periode.validated_data["du"], periode.validated_data["au"]

    @extend_schema(
        parameters=[OpenApiParameter("du", str), OpenApiParameter("au", str)],
        responses=ReleveSerializer,
    )
    @action(detail=True)
    def releve(self, request: Request, pk: str) -> Response:
        """Historique du compte avec le solde courant ; 30 jours par défaut (US-064)."""
        du, au = self._periode(request.query_params)
        return Response(
            ReleveSerializer(releve_de(self.get_object(), du, au)).data,
        )

    @extend_schema(
        parameters=[OpenApiParameter("du", str), OpenApiParameter("au", str)],
        responses={(200, "application/pdf"): OpenApiTypes.BINARY},
    )
    @action(detail=True, url_path="releve-pdf", url_name="releve-pdf")
    def releve_pdf(self, request: Request, pk: str) -> HttpResponse:
        du, au = self._periode(request.query_params)
        client = self.get_object()
        reponse = HttpResponse(
            pdf_releve(client, releve_de(client, du, au), du, au),
            content_type="application/pdf",
        )
        reponse["Content-Disposition"] = f'inline; filename="releve-{client.pk}.pdf"'
        return reponse

    @extend_schema(
        request=PeriodeSerializer,
        responses={204: None, 409: ProblemeSerializer},
    )
    @action(
        detail=True,
        methods=["post"],
        url_path="envoyer-releve",
        url_name="envoyer-releve",
    )
    def envoyer_releve(self, request: Request, pk: str) -> Response:
        """Le relevé part par WhatsApp, par la file d'envoi (O15)."""
        du, au = self._periode(request.data)
        client = self.get_object()
        if not client.telephone:
            message = "Ce client n'a pas de numéro de téléphone."
            return probleme(RefusMetier("telephone_absent", message))
        with transaction.atomic():
            envoyer_le_releve(
                client,
                releve_de(client, du, au),
                du,
                au,
                auteur_de(request),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses=RelanceSerializer(many=True))
    @action(detail=True)
    def relances(self, request: Request, pk: str) -> Response:
        """Relances du client, la plus récente d'abord, avec l'état de l'envoi."""
        relances = Relance.objects.filter(client=self.get_object()).select_related(
            "client",
            "auteur",
            "message",
        )
        return Response(RelanceSerializer(relances, many=True).data)

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
        avant = tarifs_de(client)
        try:
            with transaction.atomic():
                appliquer_tarifs(client, demandes)
        except RefusMetier as refus:
            return probleme(refus)
        apres = tarifs_de(client)
        with transaction.atomic():
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
