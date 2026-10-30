"""Semaines (CdC §5.1) : planification et affectations par le propriétaire (US-030)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.application import cloture as cas_cloture
from optiboul.core.application import planning as cas_planning
from optiboul.core.application import semaines as cas
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.planning import Creneau
from optiboul.core.domain.planning import creneaux
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import code
from optiboul.core.infrastructure import tasks as taches
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.models import RapportPassation
from optiboul.core.infrastructure.models import Semaine
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde
from optiboul.core.infrastructure.semaines import depot_planning
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.notifications.infrastructure.envois import notificateur

from .contexte import auteur_de
from .erreurs import ProblemeSerializer
from .erreurs import probleme
from .permissions import DIRECTION
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

Utilisateur = get_user_model()


class PersonneSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField(source="name")
    profil = serializers.CharField(allow_null=True)


class SemaineSerializer(serializers.ModelSerializer[Semaine]):
    code = serializers.SerializerMethodField()
    du = serializers.SerializerMethodField()
    au = serializers.SerializerMethodField()
    gerant = PersonneSerializer(allow_null=True)
    production = PersonneSerializer(allow_null=True)
    planifiee_par = serializers.CharField(source="planifiee_par.name", default="")
    ouverte_par = serializers.CharField(source="ouverte_par.name", default="")
    cloturee_par = serializers.CharField(source="cloturee_par.name", default="")

    class Meta:
        model = Semaine
        fields = [
            "id",
            "code",
            "annee",
            "numero",
            "du",
            "au",
            "debut",
            "fin",
            "statut",
            "gerant",
            "production",
            "planifiee_par",
            "ouverte_le",
            "ouverte_par",
            "cloturee_le",
            "cloturee_par",
            "cloture_forcee_motif",
        ]
        read_only_fields = fields

    def get_code(self, semaine: Semaine) -> str:
        return code(semaine.numero)

    def get_du(self, semaine: Semaine) -> str:
        return f"{bornes(semaine.annee, semaine.numero).du:%Y-%m-%d}"

    def get_au(self, semaine: Semaine) -> str:
        return f"{bornes(semaine.annee, semaine.numero).au:%Y-%m-%d}"


class SemaineConflitsSerializer(serializers.Serializer):
    semaine = SemaineSerializer()
    conflits = serializers.ListField(child=serializers.CharField())


class PlanificationSerializer(serializers.Serializer):
    annee = serializers.IntegerField(min_value=2026, max_value=2100)
    numero = serializers.IntegerField(min_value=1, max_value=53)
    gerant = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        allow_null=True,
        required=False,
    )
    production = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        allow_null=True,
        required=False,
    )

    def validate(self, attrs):
        try:
            bornes(attrs["annee"], attrs["numero"])
        except ValueError as erreur:
            message = "Cette année n'a pas de semaine portant ce numéro."
            raise ValidationError({"numero": message}) from erreur
        return attrs


class AffectationsSerializer(serializers.Serializer):
    gerant = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        allow_null=True,
    )
    production = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        allow_null=True,
    )


class CreneauSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.ChoiceField(choices=[c.value for c in Creneau])
    caissiere = PersonneSerializer(allow_null=True)


class ConflitPlanningSerializer(serializers.Serializer):
    genre = serializers.ChoiceField(choices=["jour_et_nuit", "nuit_puis_jour"])
    jour = serializers.DateField()
    caissiere = serializers.IntegerField()


class PlanningSerializer(serializers.Serializer):
    creneaux = CreneauSerializer(many=True)
    vides = serializers.ListField(child=serializers.DictField())
    conflits = ConflitPlanningSerializer(many=True)


class PlacementSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.ChoiceField(choices=[c.value for c in Creneau])
    caissiere = serializers.PrimaryKeyRelatedField(
        queryset=Utilisateur.objects.all(),
        allow_null=True,
    )


def _planning(semaine: cas.EtatSemaine) -> dict:
    etat = cas_planning.etat(depot_planning, semaine)
    affectations = etat.affectations
    personnes = Utilisateur.objects.in_bulk(
        [c for c in affectations.values() if c is not None],
    )
    periode = bornes(semaine.annee, semaine.numero)
    return {
        "creneaux": [
            {
                "jour": jour,
                "creneau": creneau,
                "caissiere": (
                    PersonneSerializer(personnes[affectations[(jour, creneau)]]).data
                    if affectations.get((jour, creneau)) is not None
                    else None
                ),
            }
            for jour, creneau in creneaux(periode)
        ],
        "vides": [{"jour": jour, "creneau": creneau} for jour, creneau in etat.vides],
        "conflits": etat.conflits,
    }


class ControleSerializer(serializers.Serializer):
    cle = serializers.CharField()
    niveau = serializers.ChoiceField(choices=["ok", "surveiller", "bloquant"])
    detail = serializers.CharField(allow_blank=True)


class ClotureForceeSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=500)


class RotationSerializer(serializers.Serializer):
    gerant = serializers.IntegerField(allow_null=True)
    production = serializers.IntegerField(allow_null=True)


def _pk(utilisateur) -> int | None:
    return utilisateur.pk if utilisateur is not None else None


class SemainesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = SemaineSerializer
    queryset = Semaine.objects.select_related(
        "gerant",
        "production",
        "planifiee_par",
        "ouverte_par",
        "cloturee_par",
    )

    def get_permissions(self):
        if self.action in {
            "list",
            "retrieve",
            "planning",
            "ouvrir",
            "cloturer",
            "controles_cloture",
        }:
            return [IsAuthenticated()]
        return [ProfilParmi("proprietaire")()]

    def get_queryset(self) -> QuerySet[Semaine]:
        semaines = super().get_queryset()
        if statut := self.request.query_params.get("statut"):
            semaines = semaines.filter(statut=statut)
        return semaines

    def _reponse(
        self,
        semaine: cas.EtatSemaine,
        conflits: list[str],
        statut: int,
    ) -> Response:
        return Response(
            {
                "semaine": SemaineSerializer(
                    self.get_queryset().get(pk=semaine.id),
                ).data,
                "conflits": conflits,
            },
            status=statut,
        )

    @extend_schema(
        request=PlanificationSerializer,
        responses={201: SemaineConflitsSerializer, 409: ProblemeSerializer},
    )
    def create(self, request: Request) -> Response:
        corps = PlanificationSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        try:
            semaine, conflits = cas.planifier(
                depot_semaines,
                journal,
                annee=donnees["annee"],
                numero=donnees["numero"],
                gerant=_pk(donnees.get("gerant")),
                production=_pk(donnees.get("production")),
                auteur=auteur_de(request),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return self._reponse(semaine, conflits, status.HTTP_201_CREATED)

    @extend_schema(
        request=AffectationsSerializer,
        responses={200: SemaineConflitsSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def affectations(self, request: Request, pk: str) -> Response:
        corps = AffectationsSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            semaine, conflits = cas.affecter(
                depot_semaines,
                journal,
                semaine_id=self.get_object().pk,
                gerant=_pk(corps.validated_data["gerant"]),
                production=_pk(corps.validated_data["production"]),
                auteur=auteur_de(request),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return self._reponse(semaine, conflits, status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses={200: SemaineConflitsSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"], url_path="copier-precedente")
    def copier_precedente(self, request: Request, pk: str) -> Response:
        try:
            semaine, conflits = cas.copier_precedente(
                depot_semaines,
                journal,
                semaine_id=self.get_object().pk,
                auteur=auteur_de(request),
            )
        except RefusMetier as refus:
            return probleme(refus)
        # Le planning des caisses suit, décalé de 7 jours (US-031).
        cas_planning.copier_precedent(depot_planning, depot_semaines, semaine=semaine)
        return self._reponse(semaine, conflits, status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses={200: SemaineSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def ouvrir(self, request: Request, pk: str) -> Response:
        """Ouverture par le gérant affecté ou le propriétaire (CdC §5.1)."""
        try:
            semaine = cas.ouvrir(
                depot_semaines,
                journal,
                semaine_id=self.get_object().pk,
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(SemaineSerializer(self.get_queryset().get(pk=semaine.id)).data)

    @extend_schema(responses=ControleSerializer(many=True))
    @action(detail=True, url_path="controles-cloture")
    def controles_cloture(self, request: Request, pk: str) -> Response:
        """Bloquants (caisse ouverte, production en cours) et « à voir » (CdC §5.1)."""
        semaine = depot_semaines.obtenir(self.get_object().pk)
        assert semaine is not None
        return Response(
            [cas_cloture.projeter(c) for c in cas_cloture.controles(semaine)],
        )

    @extend_schema(
        request=None,
        responses={200: SemaineSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def cloturer(self, request: Request, pk: str) -> Response:
        """Clôture par le gérant affecté ou le propriétaire ; sauvegarde (US-033)."""
        semaine_id = self.get_object().pk
        try:
            with transaction.atomic():
                cas_cloture.cloturer(
                    depot_semaines,
                    journal,
                    semaine_id=semaine_id,
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
                demander_sauvegarde(Declencheur.CLOTURE_SEMAINE)
                # Le rapport de passation part au gérant suivant (US-034).
                transaction.on_commit(lambda: taches.passation.delay(semaine_id))
        except RefusMetier as refus:
            return probleme(refus)
        return Response(SemaineSerializer(self.get_queryset().get(pk=semaine_id)).data)

    @extend_schema(
        request=ClotureForceeSerializer,
        responses={200: SemaineSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"], url_path="cloturer-forcee")
    def cloturer_forcee(self, request: Request, pk: str) -> Response:
        """Le propriétaire force la clôture avec un motif (US-035, O8)."""
        corps = ClotureForceeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        semaine_id = self.get_object().pk
        try:
            with transaction.atomic():
                cas_cloture.cloturer_forcee(
                    depot_semaines,
                    journal,
                    notificateur,
                    semaine_id=semaine_id,
                    motif=corps.validated_data["motif"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
                demander_sauvegarde(Declencheur.CLOTURE_SEMAINE)
                transaction.on_commit(lambda: taches.passation.delay(semaine_id))
        except RefusMetier as refus:
            return probleme(refus)
        return Response(SemaineSerializer(self.get_queryset().get(pk=semaine_id)).data)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, permission_classes=[ProfilParmi(*DIRECTION)])
    def passation(self, request: Request, pk: str) -> Response | FileResponse:
        """Rapport de passation en PDF : caisses, dettes, stock bas, incidents."""
        semaine = self.get_object()
        if semaine.statut != "cloturee":
            message = "Le rapport de passation suit la clôture de la semaine."
            return probleme(RefusMetier("semaine_non_cloturee", message))
        rapport = RapportPassation.objects.filter(semaine=semaine).first()
        if rapport is None:
            from optiboul.core.infrastructure.passation import produire  # noqa: PLC0415

            rapport = produire(semaine.pk)
        return FileResponse(
            rapport.fichier.open("rb"),
            content_type="application/pdf",
            filename=f"passation-{code(semaine.numero)}-{semaine.annee}.pdf",
        )

    @extend_schema(methods=["GET"], responses=PlanningSerializer)
    @extend_schema(
        methods=["PUT"],
        request=PlacementSerializer,
        responses={200: PlanningSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["get", "put"])
    def planning(self, request: Request, pk: str) -> Response:
        """Planning des caisses : 7 jours, jour et nuit, une caissière par créneau."""
        semaine = depot_semaines.obtenir(self.get_object().pk)
        assert semaine is not None
        if request.method == "PUT":
            corps = PlacementSerializer(data=request.data)
            corps.is_valid(raise_exception=True)
            donnees = corps.validated_data
            try:
                cas_planning.placer(
                    depot_planning,
                    depot_semaines,
                    journal,
                    semaine=semaine,
                    jour=donnees["jour"],
                    creneau=Creneau(donnees["creneau"]),
                    caissiere=_pk(donnees["caissiere"]),
                    auteur=auteur_de(request),
                )
            except RefusMetier as refus:
                return probleme(refus)
        return Response(_planning(semaine))

    @extend_schema(
        parameters=[
            OpenApiParameter("annee", OpenApiTypes.INT, required=True),
            OpenApiParameter("numero", OpenApiTypes.INT, required=True),
        ],
        responses=RotationSerializer,
    )
    @action(detail=False)
    def rotation(self, request: Request) -> Response:
        """Gérant et responsable proposés pour une semaine (O9)."""
        corps = PlanificationSerializer(data=request.query_params)
        corps.is_valid(raise_exception=True)
        annee, numero = corps.validated_data["annee"], corps.validated_data["numero"]
        return Response(cas.rotation(depot_semaines, annee, numero))
