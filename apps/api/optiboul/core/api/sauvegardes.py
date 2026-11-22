"""Sauvegardes (US-142) : état, lancement manuel et restauration (#304), réservés à
l'administrateur."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut
from optiboul.core.domain.sauvegardes import copie_cloud_en_retard
from optiboul.core.infrastructure import restaurations
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import depot_sauvegardes

from .contexte import auteur_de
from .erreurs import ProblemeSerializer
from .idempotence import EN_TETE
from .idempotence import LONGUEUR_MAX
from .idempotence import PARAMETRE
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


class EchecSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    genre = serializers.CharField()
    le = serializers.DateTimeField()
    erreur = serializers.CharField(allow_blank=True)


class EtatSauvegardesSerializer(serializers.Serializer):
    derniere_locale = serializers.DateTimeField(allow_null=True)
    derniere_cloud = serializers.DateTimeField(allow_null=True)
    cloud_en_retard = serializers.BooleanField()
    seuil_alerte_heures = serializers.IntegerField()
    derniere_echec = EchecSerializer(
        allow_null=True,
        help_text="Dernière copie en échec, si elle est plus récente que la "
        "dernière réussie du même genre (#359).",
    )


class LancementSerializer(serializers.Serializer):
    genre = serializers.ChoiceField(
        choices=[Genre.LOCALE, Genre.CLOUD],
        default=Genre.CLOUD,
        help_text="locale : copie sur le serveur ; cloud : copie locale puis "
        "copie chiffrée hors du serveur (par défaut).",
    )


class SauvegardeLanceeSerializer(serializers.Serializer):
    id = serializers.IntegerField(
        help_text="La copie à suivre : GET sauvegardes/{id}/.",
    )
    genre = serializers.CharField()
    statut = serializers.CharField()


def derniere_echec() -> dict | None:
    """Un échec n'est signalé que s'il n'a pas été suivi d'une copie réussie."""
    echec = (
        Sauvegarde.objects.filter(statut=Statut.ECHEC).order_by("-debut", "-id").first()
    )
    if echec is None:
        return None
    reussie_depuis = Sauvegarde.objects.filter(
        genre=echec.genre,
        statut=Statut.REUSSIE,
        debut__gt=echec.debut,
    ).exists()
    if reussie_depuis:
        return None
    return {
        "id": echec.pk,
        "genre": echec.genre,
        "le": echec.fin or echec.debut,
        "erreur": echec.erreur,
    }


CONFIRMATION = "RESTAURER"


class DemandeRestaurationSerializer(serializers.Serializer):
    confirmation = serializers.CharField(
        required=False,
        help_text=f"Facultatif ; s'il est envoyé : « {CONFIRMATION} ».",
    )


class TotalCompareSerializer(serializers.Serializer):
    avant = serializers.IntegerField(help_text="Dans la copie restaurée.")
    apres = serializers.IntegerField(help_text="Dans la base après restauration.")
    ok = serializers.BooleanField(help_text="Les deux totaux sont égaux (#359).")


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


class ControleRestaurationSerializer(serializers.Serializer):
    cle = serializers.ChoiceField(choices=["sessions", "soldes_clients", "stocks"])
    ok = serializers.BooleanField(help_text="Même total dans la copie et dans la base.")
    avant = serializers.IntegerField(help_text="Dans la copie restaurée.")
    apres = serializers.IntegerField(help_text="Dans la base après restauration.")


class RestaurationFaiteSerializer(serializers.Serializer):
    copie_avant = SauvegardeSerializer(
        help_text="Copie de sûreté de la base remplacée (genre avant_restauration).",
    )
    controles = ControleRestaurationSerializer(many=True)
    restauration = RestaurationSerializer(
        help_text="Aussi lisible par GET sauvegardes/restaurations/{id}/.",
    )


def _refus(code: str, message: str, statut: int) -> Response:
    return Response({"detail": message, "code": code}, status=statut)


class SauvegardesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
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
                "derniere_echec": derniere_echec(),
            },
        )

    @extend_schema(
        request=LancementSerializer,
        responses={202: SauvegardeLanceeSerializer},
    )
    @action(detail=False, methods=["post"])
    def lancer(self, request: Request) -> Response:
        """Copie manuelle, locale ou cloud ; suivie par son `id` (#359)."""
        corps = LancementSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        genre = corps.validated_data["genre"]
        locale = depot_sauvegardes.commencer(Genre.LOCALE, Declencheur.MANUELLE, None)
        cloud = None
        if genre == Genre.CLOUD:
            cloud = depot_sauvegardes.commencer(
                Genre.CLOUD,
                Declencheur.MANUELLE,
                locale,
            )
        suivie = cloud or locale
        journaliser(
            "sauvegarde.demandee",
            auteur=auteur_de(request),
            objet_type="sauvegarde",
            objet_id=suivie,
            apres={"genre": genre},
        )
        from optiboul.core.infrastructure.tasks import sauvegarder  # noqa: PLC0415

        transaction.on_commit(
            lambda: sauvegarder.delay(
                str(Declencheur.MANUELLE),
                locale,
                cloud,
                avec_cloud=cloud is not None,
            ),
        )
        return Response(
            {"id": suivie, "genre": genre, "statut": Statut.EN_COURS},
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


CLE_REJOUEE = "optiboul:restauration:cle:{}:{}"


@extend_schema(
    operation_id="sauvegardes_restaurer_create",
    tags=["sauvegardes"],
    parameters=[OpenApiParameter("id", int, OpenApiParameter.PATH), PARAMETRE],
    request=DemandeRestaurationSerializer,
    responses={
        200: RestaurationFaiteSerializer,
        400: ProblemeSerializer,
        404: ProblemeSerializer,
        409: ProblemeSerializer,
    },
)
@api_view(["POST"])
@permission_classes([ProfilParmi("administrateur")])
def restaurer_sauvegarde(request: Request, id: int) -> Response:  # noqa: A002, PLR0911
    """Remplace la base par cette copie (#359), après une copie de sûreté.

    La réponse arrive une fois la restauration finie : copie de sûreté et contrôles
    des totaux. Une seule à la fois ; une même `Idempotency-Key` rejoue la réponse.
    Hors transaction : `pg_restore` doit pouvoir remplacer les tables.
    """
    cle = request.headers.get(EN_TETE, "").strip()
    if not cle or len(cle) > LONGUEUR_MAX:
        return _refus(
            "cle_idempotence_absente",
            f"En-tête {EN_TETE} obligatoire (100 caractères au plus).",
            status.HTTP_400_BAD_REQUEST,
        )
    # Gardée dans Redis : la table des requêtes idempotentes est elle-même remplacée.
    rejouee = CLE_REJOUEE.format(request.user.pk, cle)
    if (deja := cache.get(rejouee)) is not None:
        return Response(deja, headers={"Idempotent-Replayed": "true"})
    corps = DemandeRestaurationSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    confirmation = corps.validated_data.get("confirmation")
    if confirmation is not None and confirmation != CONFIRMATION:
        return _refus(
            "confirmation_invalide",
            f"Recopiez « {CONFIRMATION} » pour confirmer.",
            status.HTTP_400_BAD_REQUEST,
        )
    sauvegarde = Sauvegarde.objects.filter(pk=id).first()
    if sauvegarde is None:
        return _refus(
            "sauvegarde_inconnue",
            "Cette sauvegarde n'existe pas.",
            status.HTTP_404_NOT_FOUND,
        )
    if not restaurations.restaurable(sauvegarde):
        return _refus(
            "restauration_impossible",
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
    etat = restaurations.executer(etat["id"]) or etat
    if etat["statut"] != restaurations.TERMINEE:
        reponse = _refus(
            "restauration_impossible",
            f"Restauration impossible, base inchangée : {etat['erreur']}",
            status.HTTP_409_CONFLICT,
        )
        reponse.data["restauration"] = RestaurationSerializer(etat).data
        return reponse
    resultat = {
        "copie_avant": SauvegardeSerializer(
            Sauvegarde.objects.get(pk=etat["copie_de_surete"]),
        ).data,
        "controles": [
            {"cle": nom, **totaux} for nom, totaux in (etat["controles"] or {}).items()
        ],
        "restauration": RestaurationSerializer(etat).data,
    }
    cache.set(rejouee, resultat, restaurations.CONSERVATION)
    return Response(resultat)


restaurer_sauvegarde = transaction.non_atomic_requests(restaurer_sauvegarde)
