"""Caisses (CdC §5.2) : ouverture (US-040) ; une caissière ne voit que ses caisses."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.caisse.application import caisses as cas
from optiboul.caisse.infrastructure.caisses import depots
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

Utilisateur = get_user_model()


class CaissiereSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField(source="name")


class CaisseSerializer(serializers.ModelSerializer[Caisse]):
    caissiere = CaissiereSerializer()
    planifiee = CaissiereSerializer(allow_null=True)
    semaine = serializers.IntegerField(source="semaine_id")

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
        ]
        read_only_fields = fields


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
    queryset = Caisse.objects.select_related("caissiere", "planifiee")

    def get_queryset(self) -> QuerySet[Caisse]:
        caisses = super().get_queryset()
        if profil_de(self.request) == "caissier":
            # Une caissière ne voit que ses caisses (CdC §5.2).
            return caisses.filter(caissiere_id=self.request.user.pk)
        return caisses

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
        return Response(EspecesSerializer(detail).data)

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
