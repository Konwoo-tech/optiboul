"""Sauvegardes (US-142) : état, lancement manuel et restauration (#304), réservés à
l'administrateur."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import copie_cloud_en_retard
from optiboul.core.infrastructure import restaurations
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde
from optiboul.core.infrastructure.sauvegardes import depot_sauvegardes

from .contexte import auteur_de
from .erreurs import ProblemeSerializer
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from rest_framework.request import Request


class SauvegardeSerializer(serializers.ModelSerializer[Sauvegarde]):
    class Meta:
        model = Sauvegarde
        fields = [
            "id",
            "genre",
            "declencheur",
            "statut",
            "source",
            "emplacement",
            "taille",
            "erreur",
            "debut",
            "fin",
        ]
        read_only_fields = fields


class EtatSauvegardesSerializer(serializers.Serializer):
    derniere_locale = serializers.DateTimeField(allow_null=True)
    derniere_cloud = serializers.DateTimeField(allow_null=True)
    cloud_en_retard = serializers.BooleanField()
    seuil_alerte_heures = serializers.IntegerField()


CONFIRMATION = "RESTAURER"


class DemandeRestaurationSerializer(serializers.Serializer):
    confirmation = serializers.CharField(
        help_text=f"« {CONFIRMATION} », recopié par l'administrateur.",
    )


class TotalCompareSerializer(serializers.Serializer):
    avant = serializers.IntegerField(help_text="Dans la copie restaurée.")
    apres = serializers.IntegerField(help_text="Dans la base après restauration.")


class ControlesSerializer(serializers.Serializer):
    sessions = TotalCompareSerializer(help_text="Nombre de caisses (sessions).")
    soldes_clients = TotalCompareSerializer(
        help_text="Somme des soldes des clients, en FCFA (R21).",
    )
    stocks = TotalCompareSerializer(help_text="Nombre de mouvements de stock.")


class RestaurationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    statut = serializers.ChoiceField(
        choices=[
            restaurations.EN_COURS,
            restaurations.TERMINEE,
            restaurations.ECHEC,
        ],
    )
    sauvegarde = serializers.IntegerField(help_text="La copie restaurée.")
    copie_de_surete = serializers.IntegerField(
        help_text="Sauvegarde « avant_restauration » de la base remplacée.",
    )
    controles = ControlesSerializer(
        allow_null=True,
        help_text="Vide tant que la restauration n'est pas terminée.",
    )
    erreur = serializers.CharField(allow_blank=True)
    debut = serializers.DateTimeField()
    fin = serializers.DateTimeField(allow_null=True)


class RestaurationLanceeSerializer(serializers.Serializer):
    restauration = RestaurationSerializer()


def _refus(code: str, message: str, statut: int) -> Response:
    return Response({"detail": message, "code": code}, status=statut)


class SauvegardesViewSet(ListModelMixin, GenericViewSet):
    serializer_class = SauvegardeSerializer
    permission_classes = [ProfilParmi("administrateur")]
    queryset = Sauvegarde.objects.all()

    @extend_schema(responses=EtatSauvegardesSerializer)
    @action(detail=False)
    def etat(self, request: Request) -> Response:
        seuil = parametre("alerte_sauvegarde_cloud")
        cloud = depot_sauvegardes.derniere_reussie(Genre.CLOUD)
        return Response(
            {
                "derniere_locale": depot_sauvegardes.derniere_reussie(Genre.LOCALE),
                "derniere_cloud": cloud,
                "cloud_en_retard": copie_cloud_en_retard(cloud, timezone.now(), seuil),
                "seuil_alerte_heures": seuil,
            },
        )

    @extend_schema(request=None, responses={202: None})
    @action(detail=False, methods=["post"])
    def lancer(self, request: Request) -> Response:
        demander_sauvegarde(Declencheur.MANUELLE)
        journaliser(
            "sauvegarde.demandee",
            auteur=auteur_de(request),
            objet_type="sauvegarde",
        )
        return Response(status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        request=DemandeRestaurationSerializer,
        responses={
            202: RestaurationLanceeSerializer,
            400: ProblemeSerializer,
            404: ProblemeSerializer,
            409: ProblemeSerializer,
        },
    )
    @action(detail=True, methods=["post"])
    def restaurer(self, request: Request, pk: str) -> Response:
        """Remplace la base par cette copie, après une copie de sûreté (#304).

        Action destructive : une seule restauration à la fois, confirmation recopiée.
        Le travail se fait en tâche de fond ; suivre `restaurations/{id}/`.
        """
        corps = DemandeRestaurationSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        if corps.validated_data["confirmation"] != CONFIRMATION:
            return _refus(
                "confirmation_invalide",
                f"Recopiez « {CONFIRMATION} » pour confirmer.",
                status.HTTP_400_BAD_REQUEST,
            )
        sauvegarde = Sauvegarde.objects.filter(pk=pk).first()
        if sauvegarde is None:
            return _refus(
                "sauvegarde_inconnue",
                "Cette sauvegarde n'existe pas.",
                status.HTTP_404_NOT_FOUND,
            )
        if not restaurations.restaurable(sauvegarde):
            return _refus(
                "sauvegarde_non_restaurable",
                "Seule une copie locale réussie, présente sur le serveur, se restaure.",
                status.HTTP_409_CONFLICT,
            )
        etat = restaurations.commencer(sauvegarde, auteur_de(request))
        if etat is None:
            return _refus(
                "restauration_en_cours",
                "Une restauration est déjà en cours.",
                status.HTTP_409_CONFLICT,
            )
        journaliser(
            "sauvegarde.restauration_demandee",
            auteur=auteur_de(request),
            objet_type="sauvegarde",
            objet_id=sauvegarde.pk,
            apres={
                "restauration": etat["id"],
                "copie_de_surete": etat["copie_de_surete"],
            },
        )
        from optiboul.core.infrastructure.tasks import restaurer as tache  # noqa: PLC0415

        transaction.on_commit(lambda: tache.delay(etat["id"]))
        return Response(
            {"restauration": RestaurationSerializer(etat).data},
            status=status.HTTP_202_ACCEPTED,
        )

    @extend_schema(
        parameters=[OpenApiParameter("restauration", int, OpenApiParameter.PATH)],
        responses={200: RestaurationSerializer, 404: ProblemeSerializer},
    )
    @action(
        detail=False,
        url_path=r"restaurations/(?P<restauration>[0-9]+)",
        url_name="restauration",
    )
    def restauration(self, request: Request, restauration: str) -> Response:
        """Suivi d'une restauration et contrôle des totaux (avant / après)."""
        etat = restaurations.lire(int(restauration))
        if etat is None:
            return _refus(
                "restauration_inconnue",
                "Cette restauration n'existe pas ou n'est plus suivie.",
                status.HTTP_404_NOT_FOUND,
            )
        return Response(RestaurationSerializer(etat).data)
