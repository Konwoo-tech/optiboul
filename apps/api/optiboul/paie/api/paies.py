"""Employés et états de paie (US-120, CdC §5.10) : gérant, propriétaire en lecture."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.paie.application import paies as cas
from optiboul.paie.infrastructure.models import Employe
from optiboul.paie.infrastructure.models import EtatPaie
from optiboul.paie.infrastructure.models import LignePaie
from optiboul.paie.infrastructure.paies import calcul_de
from optiboul.paie.infrastructure.paies import depots

if TYPE_CHECKING:
    from rest_framework.request import Request


class EmployeSerializer(serializers.ModelSerializer[Employe]):
    class Meta:
        model = Employe
        fields = [
            "id",
            "nom",
            "poste",
            "telephone",
            "salaire_base",
            "utilisateur",
            "actif",
        ]
        read_only_fields = ["id"]


class EmployesViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """Un employé n'est jamais supprimé : il est désactivé, ses paies restent."""

    serializer_class = EmployeSerializer
    queryset = Employe.objects.all()
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi(*DIRECTION)()]
        return [ProfilParmi("gerant")()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        employe = serializer.save()
        journaliser(
            "employe.cree",
            auteur=auteur_de(self.request),
            objet_type="employe",
            objet_id=employe.pk,
            apres={"nom": employe.nom, "salaire_base": employe.salaire_base},
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        employe = serializer.save()
        journaliser(
            "employe.modifie",
            auteur=auteur_de(self.request),
            objet_type="employe",
            objet_id=employe.pk,
            apres={
                "nom": employe.nom,
                "salaire_base": employe.salaire_base,
                "actif": employe.actif,
            },
        )


class LignePaieSerializer(serializers.ModelSerializer[LignePaie]):
    employe = serializers.CharField(source="employe.nom")
    montant_absences = serializers.SerializerMethodField()
    penalites = serializers.SerializerMethodField()
    gains = serializers.SerializerMethodField()
    net = serializers.SerializerMethodField()

    class Meta:
        model = LignePaie
        fields = [
            "id",
            "employe",
            "base",
            "absences",
            "montant_absences",
            "avances",
            "penalites",
            "gains",
            "impaye",
            "net",
        ]
        read_only_fields = fields

    def get_montant_absences(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).absences

    def get_penalites(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).penalites

    def get_gains(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).gains

    def get_net(self, ligne: LignePaie) -> int:
        """Base, moins absences, avances et pénalités, plus gains et impayé."""
        return calcul_de(ligne).net


class EtatPaieSerializer(serializers.ModelSerializer[EtatPaie]):
    lignes = LignePaieSerializer(many=True, read_only=True)
    total_net = serializers.SerializerMethodField()

    class Meta:
        model = EtatPaie
        fields = ["id", "mois", "statut", "total_net", "lignes"]
        read_only_fields = fields

    def get_total_net(self, etat: EtatPaie) -> int:
        return sum(calcul_de(ligne).net for ligne in etat.lignes.all())


class PreparerSerializer(serializers.Serializer):
    mois = serializers.DateField(help_text="Un jour du mois de paie.")


class ModifierLigneSerializer(serializers.Serializer):
    absences = serializers.DecimalField(max_digits=4, decimal_places=1)
    avances = serializers.IntegerField()


class PaiesViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """États de paie du plus récent au plus ancien."""

    serializer_class = EtatPaieSerializer
    queryset = EtatPaie.objects.prefetch_related("lignes__employe")
    permission_classes = [ProfilParmi(*DIRECTION)]

    @extend_schema(
        request=PreparerSerializer,
        responses={201: EtatPaieSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def preparer(self, request: Request) -> Response:
        """Le brouillon du mois : une ligne par employé actif."""
        corps = PreparerSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                etat = cas.preparer(
                    depots,
                    mois=corps.validated_data["mois"].replace(day=1),
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            EtatPaieSerializer(self.get_queryset().get(pk=etat)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=ModifierLigneSerializer,
        responses={200: LignePaieSerializer, 409: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["put"],
        url_path=r"lignes/(?P<ligne>\d+)",
        url_name="ligne",
    )
    def modifier_ligne(self, request: Request, ligne: str) -> Response:
        """Absences et avances, tant que l'état est en brouillon."""
        corps = ModifierLigneSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees: dict[str, Any] = corps.validated_data
        try:
            with transaction.atomic():
                cas.modifier_ligne(
                    depots,
                    ligne_id=int(ligne),
                    absences=donnees["absences"],
                    avances=donnees["avances"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(LignePaieSerializer(LignePaie.objects.get(pk=ligne)).data)
