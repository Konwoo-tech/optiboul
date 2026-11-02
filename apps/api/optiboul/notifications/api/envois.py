"""État en ligne et envois en attente (US-140, CdC §5.13, O15)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Max
from django.db.models import Min
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.notifications.domain.envois import EtatInternet
from optiboul.notifications.domain.envois import StatutEnvoi
from optiboul.notifications.domain.envois import etat_internet
from optiboul.notifications.domain.envois import masquer_telephone
from optiboul.notifications.infrastructure.models import MessageSortant

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

SUIVENT_LA_FILE = ("administrateur", *DIRECTION)


class MessageSerializer(serializers.ModelSerializer[MessageSortant]):
    destinataire = serializers.SerializerMethodField()

    class Meta:
        model = MessageSortant
        fields = [
            "id",
            "canal",
            "destinataire",
            "sujet",
            "statut",
            "tentatives",
            "prochain_essai",
            "derniere_tentative",
            "derniere_erreur",
            "objet_type",
            "objet_id",
            "cree_le",
            "envoye_le",
        ]
        read_only_fields = fields

    def get_destinataire(self, message: MessageSortant) -> str:
        """Numéro masqué ; une adresse e-mail reste lisible."""
        if message.canal == "email":
            return message.destinataire
        return masquer_telephone(message.destinataire)


class EnvoisViewSet(ListModelMixin, GenericViewSet):
    """La file d'envoi (O15) : chaque message, son état et ses tentatives."""

    serializer_class = MessageSerializer
    permission_classes = [ProfilParmi(*SUIVENT_LA_FILE)]
    queryset = MessageSortant.objects.order_by("-cree_le", "-id")

    def get_queryset(self) -> QuerySet[MessageSortant]:
        messages = super().get_queryset()
        for filtre in ("statut", "canal"):
            if valeur := self.request.query_params.get(filtre):
                messages = messages.filter(**{filtre: valeur})
        return messages

    @extend_schema(
        parameters=[
            OpenApiParameter("statut", str, enum=[s.value for s in StatutEnvoi]),
            OpenApiParameter("canal", str),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(request=None, responses=MessageSerializer)
    @action(detail=True, methods=["post"])
    def relancer(self, request: Request, pk: str) -> Response:
        """Un message en échec repart dans la file, ses tentatives remises à zéro."""
        message = self.get_object()
        if message.statut != StatutEnvoi.ECHEC:
            refus = RefusMetier(
                "envoi_non_en_echec",
                "Seul un envoi en échec se relance.",
            )
            return probleme(refus)
        message.statut = StatutEnvoi.EN_ATTENTE
        message.tentatives = 0
        message.prochain_essai = timezone.now()
        message.save(update_fields=["statut", "tentatives", "prochain_essai"])
        journaliser(
            "envoi.relance",
            auteur=auteur_de(request),
            objet_type="message",
            objet_id=message.pk,
            apres={"canal": message.canal},
        )
        return Response(MessageSerializer(message).data)


class EtatEnvoisSerializer(serializers.Serializer):
    internet = serializers.ChoiceField(
        choices=[e.value for e in EtatInternet],
        help_text="D'après la dernière tentative de la file d'envoi.",
    )
    en_attente = serializers.IntegerField(help_text="Messages qui partiront au retour.")
    en_echec = serializers.IntegerField()
    plus_ancien_en_attente = serializers.DateTimeField(allow_null=True)
    derniere_tentative = serializers.DateTimeField(allow_null=True)


@extend_schema(responses=EtatEnvoisSerializer)
@api_view(["GET"])
@permission_classes([ProfilParmi(*TOUS_LES_PROFILS)])
def etat_des_envois(request: Request) -> Response:
    """Pour le bandeau : internet, et ce qui attend dans la file d'envoi (O15)."""
    succes = MessageSortant.objects.filter(statut=StatutEnvoi.ENVOYE).aggregate(
        le=Max("derniere_tentative"),
    )["le"]
    echec = (
        MessageSortant.objects.exclude(statut=StatutEnvoi.ENVOYE)
        .exclude(tentatives=0)
        .aggregate(le=Max("derniere_tentative"))["le"]
    )
    en_attente = MessageSortant.objects.filter(statut=StatutEnvoi.EN_ATTENTE)
    return Response(
        EtatEnvoisSerializer(
            {
                "internet": etat_internet(succes, echec),
                "en_attente": en_attente.count(),
                "en_echec": MessageSortant.objects.filter(
                    statut=StatutEnvoi.ECHEC,
                ).count(),
                "plus_ancien_en_attente": en_attente.aggregate(le=Min("cree_le"))["le"],
                "derniere_tentative": max(filter(None, [succes, echec]), default=None),
            },
        ).data,
    )
