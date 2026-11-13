"""Caisses (CdC §5.2) : ouverture (US-040) ; une caissière ne voit que ses caisses."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db import transaction
from django.db.models import Count
from django.db.models import OuterRef
from django.db.models import Q
from django.db.models import Subquery
from django.db.models import Sum
from django.db.models.functions import Coalesce
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

from optiboul.caisse.application import caisses as cas
from optiboul.caisse.domain.caisses import remise_proposee
from optiboul.caisse.infrastructure.caisses import depots
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde
from optiboul.ventes.infrastructure.models import Encaissement

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

Utilisateur = get_user_model()


class CaissiereSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField(source="name")


RECETTE = Coalesce(
    Subquery(
        Encaissement.objects.filter(caisse=OuterRef("pk"))
        .values("caisse")
        .annotate(total=Sum("montant"))
        .values("total"),
    ),
    0,
)


class CaisseSerializer(serializers.ModelSerializer[Caisse]):
    caissiere = CaissiereSerializer()
    planifiee = CaissiereSerializer(allow_null=True)
    semaine = serializers.IntegerField(source="semaine_id")
    ouverte_par = CaissiereSerializer(
        source="caissiere",
        help_text="La personne connectée qui a ouvert : c'est toujours la caissière.",
    )
    fermee_par = CaissiereSerializer(
        allow_null=True,
        help_text="Dernière fermeture ; null tant que la caisse est ouverte (#312).",
    )
    recette = serializers.SerializerMethodField()

    class Meta:
        model = Caisse
        fields = [
            "id",
            "semaine",
            "jour",
            "creneau",
            "caissiere",
            "planifiee",
            "hors_planning",
            "fonds",
            "attendu",
            "compte",
            "ecart",
            "statut",
            "en_cours",
            "ouverte_le",
            "fermee_le",
            "ouverte_par",
            "fermee_par",
            "recette",
        ]
        read_only_fields = fields

    def get_recette(self, caisse: Caisse) -> int:
        """Encaissements de la caisse, tous modes, en FCFA (comme le récapitulatif)."""
        recette = getattr(caisse, "recette", None)
        if recette is not None:
            return int(recette)
        total = caisse.encaissements.aggregate(total=Sum("montant"))["total"]
        return int(total or 0)


class ProchaineSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.CharField()
    planifiee = CaissiereSerializer(allow_null=True)
    fonds_propose = serializers.IntegerField()
    caisse_en_cours = CaisseSerializer(allow_null=True)


class OuvertureSerializer(serializers.Serializer):
    fonds = serializers.IntegerField(min_value=0)


class EspecesSerializer(serializers.Serializer):
    fonds = serializers.IntegerField()
    especes = serializers.IntegerField()
    depenses = serializers.IntegerField()
    remises = serializers.IntegerField()
    attendu = serializers.IntegerField()
    plafond = serializers.IntegerField(help_text="Plafond d'espèces en caisse (R18).")
    remise_proposee = serializers.IntegerField(
        help_text="Au-delà du plafond : tout sauf le fonds ; 0 sinon.",
    )


class RecapitulatifSerializer(serializers.Serializer):
    caissiere = CaissiereSerializer()
    ouvertures = serializers.IntegerField()
    recette = serializers.IntegerField(
        help_text="Encaissements de ses caisses, en FCFA.",
    )
    ecart_cumule = serializers.IntegerField(
        help_text="Somme des écarts à la fermeture.",
    )
    manques = serializers.IntegerField(help_text="Caisses fermées avec un manque.")


PARAMETRES_HISTORIQUE = [
    OpenApiParameter("du", str, description="AAAA-MM-JJ"),
    OpenApiParameter("au", str, description="AAAA-MM-JJ"),
    OpenApiParameter("caissiere", int),
    OpenApiParameter("statut", str),
]


class RemiseSerializer(serializers.Serializer):
    montant = serializers.IntegerField(min_value=1)
    receveur = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Le gérant ou le propriétaire qui reçoit ; vide : le coffre.",
    )


def _especes(detail: cas.Especes) -> dict[str, int]:
    plafond = parametre("plafond_especes")
    return {
        **vars(detail),
        "plafond": plafond,
        "remise_proposee": remise_proposee(detail.attendu, detail.fonds, plafond),
    }


class FermetureSerializer(serializers.Serializer):
    compte = serializers.IntegerField(min_value=0)


class ResultatFermetureSerializer(serializers.Serializer):
    caisse = CaisseSerializer()
    resultat = serializers.ChoiceField(choices=["JUSTE", "MANQUE", "EXCEDENT"])


class ReouvertureSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=500)


class CaissesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = CaisseSerializer
    permission_classes = [ProfilParmi("caissier", *DIRECTION)]
    queryset = Caisse.objects.select_related(
        "caissiere",
        "planifiee",
        "fermee_par",
    )

    def get_queryset(self) -> QuerySet[Caisse]:
        caisses = super().get_queryset()
        if self.action != "recapitulatif":
            # Sous-requête, pas jointure : les sommes du récapitulatif restent justes.
            caisses = caisses.annotate(recette=RECETTE)
        if profil_de(self.request) == "caissier":
            # Une caissière ne voit que ses caisses (CdC §5.2).
            caisses = caisses.filter(caissiere_id=self.request.user.pk)
        if self.action not in {"list", "recapitulatif"}:
            return caisses
        parametres = self.request.query_params
        filtres = {
            "du": "jour__gte",
            "au": "jour__lte",
            "caissiere": "caissiere_id",
            "statut": "statut",
        }
        for nom, champ in filtres.items():
            if valeur := parametres.get(nom):
                caisses = caisses.filter(**{champ: valeur})
        return caisses

    @extend_schema(parameters=PARAMETRES_HISTORIQUE)
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        """Historique par jour et par caissière, la plus récente d'abord."""
        return super().list(request, *args, **kwargs)

    @extend_schema(
        parameters=PARAMETRES_HISTORIQUE,
        responses=RecapitulatifSerializer(many=True),
    )
    @action(detail=False, pagination_class=None)
    def recapitulatif(self, request: Request) -> Response:
        """Par caissière : ouvertures, recette et écart cumulé (CdC §5.2)."""
        caisses = self.get_queryset()
        lignes = (
            caisses.values("caissiere_id", "caissiere__name")
            .annotate(
                ouvertures=Count("pk"),
                ecart_cumule=Coalesce(Sum("ecart"), 0),
                manques=Count("pk", filter=Q(ecart__lt=0)),
            )
            .order_by("caissiere__name")
        )
        recettes = dict(
            Encaissement.objects.filter(caisse__in=caisses)
            .values("caisse__caissiere_id")
            .annotate(total=Sum("montant"))
            .values_list("caisse__caissiere_id", "total"),
        )
        return Response(
            RecapitulatifSerializer(
                [
                    {
                        "caissiere": {
                            "id": ligne["caissiere_id"],
                            "name": ligne["caissiere__name"],
                        },
                        "ouvertures": ligne["ouvertures"],
                        "recette": recettes.get(ligne["caissiere_id"], 0),
                        "ecart_cumule": ligne["ecart_cumule"],
                        "manques": ligne["manques"],
                    }
                    for ligne in lignes
                ],
                many=True,
            ).data,
        )

    @extend_schema(responses=ProchaineSerializer)
    @action(detail=False)
    def prochaine(self, request: Request) -> Response:
        """Créneau à ouvrir, caissière planifiée et fonds proposé (20 000 FCFA)."""
        suivante = cas.prochaine(depots, timezone.now())
        en_cours = (
            Caisse.objects.filter(en_cours=True).select_related("caissiere").first()
        )
        planifiee = (
            Utilisateur.objects.filter(pk=suivante.planifiee).first()
            if suivante.planifiee is not None
            else None
        )
        return Response(
            {
                "jour": suivante.jour,
                "creneau": suivante.creneau,
                "planifiee": CaissiereSerializer(planifiee).data if planifiee else None,
                "fonds_propose": parametre("fonds_caisse"),
                "caisse_en_cours": CaisseSerializer(en_cours).data
                if en_cours
                else None,
            },
        )

    @extend_schema(
        request=OuvertureSerializer,
        responses={201: CaisseSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def ouvrir(self, request: Request) -> Response:
        """Ouverture en comptant le fonds ; hors planning, le gérant est prévenu."""
        corps = OuvertureSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                caisse = cas.ouvrir(
                    depots,
                    fonds=corps.validated_data["fonds"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        except IntegrityError:
            # Deux ouvertures simultanées : la base n'en garde qu'une (R17).
            return probleme(
                RefusMetier("caisse_deja_ouverte", "Une caisse vient d'être ouverte."),
            )
        return Response(
            CaisseSerializer(self.get_queryset().get(pk=caisse.id)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=EspecesSerializer)
    @action(detail=True)
    def especes(self, request: Request, pk: str) -> Response:
        """Fonds, espèces encaissées, dépenses, remises et attendu de la caisse."""
        detail = cas.especes(depots, self.get_object().pk)
        return Response(EspecesSerializer(_especes(detail)).data)

    @extend_schema(
        request=RemiseSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: EspecesSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    @idempotent
    def remettre(self, request: Request, pk: str) -> Response:
        """Remise au coffre ou au gérant (O4) ; receveur et heure tracés."""
        corps = RemiseSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        caisse_id = self.get_object().pk
        try:
            with transaction.atomic():
                detail = cas.remettre(
                    depots,
                    caisse_id=caisse_id,
                    montant=corps.validated_data["montant"],
                    receveur=corps.validated_data.get("receveur"),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            EspecesSerializer(_especes(detail)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=FermetureSerializer,
        responses={200: ResultatFermetureSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def fermer(self, request: Request, pk: str) -> Response:
        """Un seul comptage ; statut juste, manque ou excédent ; sauvegarde (US-042)."""
        corps = FermetureSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        caisse_id = self.get_object().pk
        try:
            with transaction.atomic():
                resultat = cas.fermer(
                    depots,
                    caisse_id=caisse_id,
                    compte=corps.validated_data["compte"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
                demander_sauvegarde(Declencheur.CLOTURE_CAISSE)
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            {
                "caisse": CaisseSerializer(self.get_queryset().get(pk=caisse_id)).data,
                "resultat": resultat.statut,
            },
        )

    @extend_schema(
        request=ReouvertureSerializer,
        responses={200: CaisseSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def rouvrir(self, request: Request, pk: str) -> Response:
        """Gérant ou propriétaire, motif obligatoire ; le propriétaire est informé."""
        corps = ReouvertureSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        caisse_id = self.get_object().pk
        try:
            with transaction.atomic():
                cas.rouvrir(
                    depots,
                    caisse_id=caisse_id,
                    motif=corps.validated_data["motif"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(CaisseSerializer(self.get_queryset().get(pk=caisse_id)).data)
