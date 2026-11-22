"""Centre de notifications (US-074, CdC §5.13) : les miennes, compteur, routage."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.journal import journaliser
from optiboul.notifications.domain.regroupement import Avis
from optiboul.notifications.domain.regroupement import Groupe
from optiboul.notifications.domain.regroupement import regrouper
from optiboul.notifications.domain.routage import REGLES_DE_DEPART
from optiboul.notifications.domain.routage import CanalNotification
from optiboul.notifications.domain.routage import libelle_du_genre
from optiboul.notifications.infrastructure.envois import regle
from optiboul.notifications.infrastructure.models import Notification
from optiboul.notifications.infrastructure.models import RegleNotification

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

REGLENT_LES_NOTIFICATIONS = ("proprietaire", "administrateur")
LIMITE_REGROUPEMENT = 500


class NotificationSerializer(serializers.ModelSerializer[Notification]):
    genre_libelle = serializers.SerializerMethodField()
    lue = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "genre",
            "genre_libelle",
            "titre",
            "message",
            "lien",
            "cree_le",
            "lue_le",
            "lue",
        ]
        read_only_fields = fields

    def get_genre_libelle(self, notification: Notification) -> str:
        return libelle_du_genre(notification.genre)

    def get_lue(self, notification: Notification) -> bool:
        return notification.lue_le is not None


class CompteurSerializer(serializers.Serializer):
    non_lues = serializers.IntegerField()


class MarquageSerializer(serializers.Serializer):
    marquees = serializers.IntegerField()


class GroupeNotificationsSerializer(serializers.Serializer):
    genre = serializers.CharField()
    genre_libelle = serializers.SerializerMethodField()
    heure = serializers.DateTimeField()
    titre = serializers.CharField(help_text="Titre de la plus récente.")
    lien = serializers.CharField()
    nombre = serializers.IntegerField()
    non_lues = serializers.IntegerField()

    def get_genre_libelle(self, groupe: Groupe) -> str:
        return libelle_du_genre(groupe.genre)


class MarquerGroupeNotificationsSerializer(serializers.Serializer):
    genre = serializers.CharField()
    heure = serializers.DateTimeField()


class NotificationsViewSet(ListModelMixin, GenericViewSet):
    """Chacun ne voit que ses notifications ; chacune ouvre l'écran concerné (lien)."""

    serializer_class = NotificationSerializer
    permission_classes = [ProfilParmi(*TOUS_LES_PROFILS)]

    def get_queryset(self) -> QuerySet[Notification]:
        notifications = Notification.objects.filter(
            destinataire_id=self.request.user.pk,
        )
        if self.request.query_params.get("non_lues", "").lower() in {
            "1",
            "true",
            "oui",
        }:
            notifications = notifications.filter(lue_le=None)
        return notifications

    @extend_schema(parameters=[OpenApiParameter("non_lues", bool)])
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=CompteurSerializer)
    @action(detail=False, url_path="non-lues")
    def non_lues(self, request: Request) -> Response:
        """Compteur de l'en-tête, rafraîchi toutes les 15 s au plus (ADR-21)."""
        nombre = Notification.objects.filter(
            destinataire_id=request.user.pk,
            lue_le=None,
        ).count()
        return Response({"non_lues": nombre})

    @extend_schema(responses=GroupeNotificationsSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def regroupees(self, request: Request) -> Response:
        """Une ligne par type et par heure, pour ne pas noyer la nuit (US-073)."""
        notifications = self.get_queryset()[:LIMITE_REGROUPEMENT]
        groupes = regrouper(
            [
                Avis(
                    genre=n.genre,
                    titre=n.titre,
                    lien=n.lien,
                    le=timezone.localtime(n.cree_le),
                    lu=n.lue_le is not None,
                )
                for n in notifications
            ],
        )
        return Response(GroupeNotificationsSerializer(groupes, many=True).data)

    @extend_schema(
        request=MarquerGroupeNotificationsSerializer,
        responses=MarquageSerializer,
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="marquer-groupe-lu",
        url_name="marquer-groupe-lu",
    )
    def marquer_groupe_lu(self, request: Request) -> Response:
        corps = MarquerGroupeNotificationsSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        debut = corps.validated_data["heure"]
        marquees = Notification.objects.filter(
            destinataire_id=request.user.pk,
            genre=corps.validated_data["genre"],
            cree_le__gte=debut,
            cree_le__lt=debut + timedelta(hours=1),
            lue_le=None,
        ).update(lue_le=timezone.now())
        return Response({"marquees": marquees})

    @extend_schema(request=None, responses=NotificationSerializer)
    @action(detail=True, methods=["post"], url_path="marquer-lue")
    def marquer_lue(self, request: Request, pk: str) -> Response:
        notification = self.get_object()
        if notification.lue_le is None:
            notification.lue_le = timezone.now()
            notification.save(update_fields=["lue_le"])
        return Response(NotificationSerializer(notification).data)

    @extend_schema(request=None, responses=MarquageSerializer)
    @action(detail=False, methods=["post"], url_path="tout-marquer-lu")
    def tout_marquer_lu(self, request: Request) -> Response:
        marquees = Notification.objects.filter(
            destinataire_id=request.user.pk,
            lue_le=None,
        ).update(lue_le=timezone.now())
        return Response({"marquees": marquees})


class RegleSerializer(serializers.Serializer):
    genre = serializers.CharField(read_only=True)
    libelle = serializers.CharField(read_only=True)
    profils = serializers.ListField(
        child=serializers.ChoiceField(choices=list(TOUS_LES_PROFILS)),
    )
    canaux = serializers.ListField(
        child=serializers.ChoiceField(choices=[c.value for c in CanalNotification]),
        help_text="« application » toujours ; SMS ou WhatsApp en plus si besoin.",
    )


def _projeter(genre: str) -> dict[str, Any]:
    routage = regle(genre)
    return {
        "genre": genre,
        "libelle": routage.libelle,
        "profils": list(routage.profils),
        "canaux": [str(c) for c in routage.canaux],
    }


GENRES = [r.genre for r in REGLES_DE_DEPART]


class ReglesNotificationViewSet(ViewSet):
    """Table de routage par type et par rôle (CdC §5.13)."""

    lookup_field = "genre"
    lookup_value_regex = r"[a-z_.]+"
    permission_classes = [ProfilParmi(*REGLENT_LES_NOTIFICATIONS)]

    @extend_schema(responses=RegleSerializer(many=True))
    def list(self, request: Request) -> Response:
        return Response([_projeter(genre) for genre in GENRES])

    @extend_schema(request=RegleSerializer, responses={200: RegleSerializer})
    def update(self, request: Request, genre: str) -> Response:
        if genre not in GENRES:
            return Response(
                {"detail": "Type de notification inconnu.", "code": "genre_inconnu"},
                status=status.HTTP_404_NOT_FOUND,
            )
        corps = RegleSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        avant = _projeter(genre)
        canaux = list(
            dict.fromkeys(
                [CanalNotification.APPLICATION, *corps.validated_data["canaux"]],
            ),
        )
        auteur = auteur_de(request)
        RegleNotification.objects.update_or_create(
            genre=genre,
            defaults={
                "profils": list(dict.fromkeys(corps.validated_data["profils"])),
                "canaux": [str(c) for c in canaux],
                "modifie_par": auteur.nom,
                "modifie_le": timezone.now(),
            },
        )
        apres = _projeter(genre)
        journaliser(
            "notification.regle_modifiee",
            auteur=auteur,
            objet_type="regle_notification",
            objet_id=genre,
            avant={"profils": avant["profils"], "canaux": avant["canaux"]},
            apres={"profils": apres["profils"], "canaux": apres["canaux"]},
        )
        return Response(apres)
