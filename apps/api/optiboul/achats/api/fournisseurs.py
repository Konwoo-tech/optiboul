"""Fournisseurs et réceptions planifiées (US-100, CdC §5.7)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import mixins
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.achats.application import paiements as cas_paiements
from optiboul.achats.application import receptions as cas
from optiboul.achats.application.receptions import RECEPTIONNENT
from optiboul.achats.domain.receptions import StatutReception
from optiboul.achats.domain.receptions import verifier_planification
from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.achats.infrastructure.models import Manquant
from optiboul.achats.infrastructure.models import PaiementFournisseur
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.achats.infrastructure.paiements import depots as depots_paiements
from optiboul.achats.infrastructure.paiements import pdf_recu
from optiboul.achats.infrastructure.receptions import depots
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.stocks.infrastructure.models import Matiere

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

# CdC §3.3 : le gérant gère, le responsable de production réceptionne, le
# propriétaire consulte.
LISENT_LES_ACHATS = ("production", *DIRECTION)


class ProchaineReceptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    prevue_le = serializers.DateField()
    matiere = serializers.CharField()
    quantite = serializers.DecimalField(max_digits=12, decimal_places=3)


class FournisseurSerializer(serializers.ModelSerializer[Fournisseur]):
    matieres = serializers.SlugRelatedField(
        slug_field="code",
        many=True,
        queryset=Matiere.objects.all(),
    )
    prochaine_reception = serializers.SerializerMethodField()
    manquants = serializers.SerializerMethodField()

    class Meta:
        model = Fournisseur
        fields = [
            "id",
            "nom",
            "telephone",
            "conditions",
            "matieres",
            "actif",
            "prochaine_reception",
            "manquants",
        ]
        read_only_fields = ["id", "prochaine_reception", "manquants"]

    def get_manquants(self, fournisseur: Fournisseur) -> int:
        """Manquants encore à livrer ou à recevoir de ce fournisseur."""
        return (
            Manquant.objects.filter(reception__planifiee__fournisseur=fournisseur)
            .exclude(statut="livre")
            .count()
        )

    @extend_schema(responses=ProchaineReceptionSerializer(allow_null=True))
    def get_prochaine_reception(
        self,
        fournisseur: Fournisseur,
    ) -> dict[str, Any] | None:
        prochaine = (
            fournisseur.receptions_planifiees.filter(statut=StatutReception.PLANIFIEE)
            .select_related("matiere")
            .order_by("prevue_le", "id")
            .first()
        )
        if prochaine is None:
            return None
        return {
            "id": prochaine.pk,
            "prevue_le": prochaine.prevue_le,
            "matiere": prochaine.matiere.code,
            "quantite": prochaine.quantite,
        }


def _valeurs(fournisseur: Fournisseur) -> dict[str, Any]:
    return {
        "nom": fournisseur.nom,
        "telephone": fournisseur.telephone,
        "conditions": fournisseur.conditions,
        "actif": fournisseur.actif,
        "matieres": sorted(fournisseur.matieres.values_list("code", flat=True)),
    }


class FournisseursViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """Un fournisseur n'est jamais supprimé : il est désactivé."""

    serializer_class = FournisseurSerializer
    queryset = Fournisseur.objects.prefetch_related("matieres")
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi(*LISENT_LES_ACHATS)()]
        return [ProfilParmi(*DIRECTION)()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        fournisseur = serializer.save()
        journaliser(
            "fournisseur.cree",
            auteur=auteur_de(self.request),
            objet_type="fournisseur",
            objet_id=fournisseur.pk,
            apres=_valeurs(fournisseur),
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        assert serializer.instance is not None
        avant = _valeurs(serializer.instance)
        fournisseur = serializer.save()
        journaliser(
            "fournisseur.modifie",
            auteur=auteur_de(self.request),
            objet_type="fournisseur",
            objet_id=fournisseur.pk,
            avant=avant,
            apres=_valeurs(fournisseur),
        )


class ReceptionPlanifieeSerializer(serializers.ModelSerializer[ReceptionPlanifiee]):
    fournisseur_nom = serializers.CharField(source="fournisseur.nom", read_only=True)
    matiere = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Matiere.objects.all(),
    )
    planifiee_par = serializers.CharField(source="planifiee_par.name", read_only=True)

    class Meta:
        model = ReceptionPlanifiee
        fields = [
            "id",
            "fournisseur",
            "fournisseur_nom",
            "matiere",
            "quantite",
            "prevue_le",
            "statut",
            "planifiee_par",
            "cree_le",
        ]
        read_only_fields = ["id", "statut", "planifiee_par", "cree_le"]


class FactureSerializer(serializers.ModelSerializer[FactureFournisseur]):
    fournisseur_nom = serializers.CharField(source="fournisseur.nom")
    en_retard = serializers.SerializerMethodField()

    class Meta:
        model = FactureFournisseur
        fields = [
            "id",
            "numero",
            "fournisseur",
            "fournisseur_nom",
            "semaine",
            "farine",
            "montant",
            "echeance",
            "statut",
            "en_retard",
        ]
        read_only_fields = fields

    def get_en_retard(self, facture: FactureFournisseur) -> bool:
        return facture.statut != "payee" and facture.echeance < timezone.localdate()


class ReceptionnerSerializer(serializers.Serializer):
    quantite = serializers.DecimalField(max_digits=12, decimal_places=3)
    observation = serializers.CharField(allow_blank=True, required=False, default="")
    prix_unitaire = serializers.IntegerField(
        min_value=1,
        required=False,
        help_text="FCFA par unité de la matière ; la farine suit le prix du sac.",
    )


class ReceptionFaiteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    montant = serializers.IntegerField()
    ecart = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        help_text="Reçu moins prévu : négatif, un manquant reste à livrer.",
    )
    facture = FactureSerializer()


class PaiementFournisseurSerializer(serializers.ModelSerializer[PaiementFournisseur]):
    paye_par = serializers.CharField(source="paye_par.name")

    class Meta:
        model = PaiementFournisseur
        fields = [
            "id",
            "facture",
            "montant",
            "mode",
            "reference",
            "depense",
            "paye_par",
            "paye_le",
        ]
        read_only_fields = fields


class PayerSerializer(serializers.Serializer):
    montant = serializers.IntegerField(min_value=1)
    mode = serializers.ChoiceField(choices=list(cas_paiements.MODES))
    reference = serializers.CharField(
        max_length=60,
        required=False,
        default="",
        allow_blank=True,
    )


class FacturesViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, GenericViewSet):
    """Factures fournisseurs : à payer, en cours, en retard, payées (CdC §5.7)."""

    serializer_class = FactureSerializer
    queryset = FactureFournisseur.objects.select_related("fournisseur")

    def get_permissions(self):
        if self.action == "payer":
            return [ProfilParmi(*cas_paiements.PAIENT)()]
        return [ProfilParmi(*DIRECTION)()]

    @extend_schema(
        request=PayerSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: PaiementFournisseurSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    @idempotent
    def payer(self, request: Request, pk: str) -> Response:
        """Espèces (caisse), banque ou mobile money ; partiel possible ; une dépense
        rattachée au stock et un reçu PDF."""
        corps = PayerSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        facture = self.get_object()
        try:
            with transaction.atomic():
                paiement_id = cas_paiements.payer(
                    depots_paiements,
                    facture_id=facture.pk,
                    montant=corps.validated_data["montant"],
                    mode=corps.validated_data["mode"],
                    reference=corps.validated_data["reference"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        paiement = PaiementFournisseur.objects.select_related("paye_par").get(
            pk=paiement_id,
        )
        return Response(
            PaiementFournisseurSerializer(paiement).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(responses=PaiementFournisseurSerializer(many=True))
    @action(detail=True)
    def paiements(self, request: Request, pk: str) -> Response:
        paiements = PaiementFournisseur.objects.filter(
            facture=self.get_object(),
        ).select_related(
            "paye_par",
        )
        return Response(PaiementFournisseurSerializer(paiements, many=True).data)


class PaiementsFournisseursViewSet(mixins.RetrieveModelMixin, GenericViewSet):
    serializer_class = PaiementFournisseurSerializer
    permission_classes = [ProfilParmi(*DIRECTION)]
    queryset = PaiementFournisseur.objects.select_related(
        "paye_par",
        "facture__fournisseur",
        "depense",
    )

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True)
    def recu(self, request: Request, pk: str) -> HttpResponse:
        """Le reçu du paiement en PDF."""
        paiement = self.get_object()
        reponse = HttpResponse(pdf_recu(paiement), content_type="application/pdf")
        reponse["Content-Disposition"] = f'inline; filename="recu-{paiement.pk}.pdf"'
        return reponse


class ReceptionsPlanifieesViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    serializer_class = ReceptionPlanifieeSerializer
    queryset = ReceptionPlanifiee.objects.select_related(
        "fournisseur",
        "matiere",
        "planifiee_par",
    )

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi(*LISENT_LES_ACHATS)()]
        if self.action == "receptionner":
            return [ProfilParmi(*RECEPTIONNENT)()]
        return [ProfilParmi(*DIRECTION)()]

    @extend_schema(
        request=ReceptionnerSerializer,
        responses={201: ReceptionFaiteSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def receptionner(self, request: Request, pk: str) -> Response:
        """En un clic (O12) : la quantité prévue est proposée, on saisit le compté."""
        corps = ReceptionnerSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        planifiee = self.get_object()
        try:
            with transaction.atomic():
                recue = cas.receptionner(
                    depots,
                    planifiee_id=planifiee.pk,
                    quantite=corps.validated_data["quantite"],
                    observation=corps.validated_data["observation"],
                    prix_unitaire=corps.validated_data.get("prix_unitaire"),
                    prix_sac_farine=parametre("prix_sac_farine"),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        facture = FactureFournisseur.objects.select_related("fournisseur").get(
            pk=recue.facture,
        )
        return Response(
            ReceptionFaiteSerializer(
                {
                    "id": recue.id,
                    "montant": recue.montant,
                    "ecart": recue.ecart,
                    "facture": facture,
                },
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self) -> QuerySet[ReceptionPlanifiee]:
        receptions = super().get_queryset()
        if self.action != "list":
            return receptions
        for filtre in ("fournisseur", "statut"):
            if valeur := self.request.query_params.get(filtre):
                receptions = receptions.filter(**{filtre: valeur})
        return receptions

    @extend_schema(
        parameters=[
            OpenApiParameter("fournisseur", int),
            OpenApiParameter("statut", str, enum=[s.value for s in StatutReception]),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=ReceptionPlanifieeSerializer,
        responses={201: ReceptionPlanifieeSerializer, 409: ProblemeSerializer},
    )
    def create(self, request: Request) -> Response:
        """Le gérant planifie : fournisseur, matière, quantité, date prévue."""
        corps = ReceptionPlanifieeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        fournisseur: Fournisseur = donnees["fournisseur"]
        try:
            verifier_planification(
                matiere=donnees["matiere"].code,
                matieres_du_fournisseur=set(
                    fournisseur.matieres.values_list("code", flat=True),
                ),
                quantite=donnees["quantite"],
                prevue_le=donnees["prevue_le"],
                aujourd_hui=timezone.localdate(),
            )
        except RefusMetier as refus:
            return probleme(refus)
        with transaction.atomic():
            reception = corps.save(planifiee_par=request.user)
            journaliser(
                "reception.planifiee",
                auteur=auteur_de(request),
                objet_type="reception_planifiee",
                objet_id=reception.pk,
                apres={
                    "fournisseur": fournisseur.pk,
                    "matiere": reception.matiere.code,
                    "quantite": str(reception.quantite),
                    "prevue_le": reception.prevue_le.isoformat(),
                },
            )
        return Response(
            ReceptionPlanifieeSerializer(reception).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=None, responses={200: ReceptionPlanifieeSerializer})
    @action(detail=True, methods=["post"])
    def annuler(self, request: Request, pk: str) -> Response:
        reception = self.get_object()
        if reception.statut != StatutReception.PLANIFIEE:
            return probleme(
                RefusMetier("reception_close", "Cette réception n'est plus planifiée."),
            )
        reception.statut = StatutReception.ANNULEE
        reception.save(update_fields=["statut"])
        journaliser(
            "reception.annulee",
            auteur=auteur_de(request),
            objet_type="reception_planifiee",
            objet_id=reception.pk,
        )
        return Response(ReceptionPlanifieeSerializer(reception).data)
