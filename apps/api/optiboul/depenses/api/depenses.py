"""Dépenses (US-110, CdC §5.8) : DEP-xxxx, justificatif, rattachement obligatoire."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.depenses.application import depenses as cas
from optiboul.depenses.application.depenses import SAISISSENT
from optiboul.depenses.domain.depenses import AchatCourant
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import numero_affiche
from optiboul.depenses.infrastructure.depenses import depots
from optiboul.depenses.infrastructure.depenses import engage
from optiboul.depenses.infrastructure.models import CATEGORIES
from optiboul.depenses.infrastructure.models import Depense
from optiboul.depenses.infrastructure.models import PreAutorisation
from optiboul.production.domain.plan import session_de_production
from optiboul.ventes.infrastructure.commandes import limites

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

TAILLE_MAX = 5 * 1024 * 1024  # 5 Mo
TYPES_JUSTIFICATIF = ("image/", "application/pdf")


class DepenseSerializer(serializers.ModelSerializer[Depense]):
    code = serializers.SerializerMethodField()
    matiere = serializers.CharField(
        source="matiere.code",
        allow_null=True,
        default=None,
    )
    auteur = serializers.CharField(source="auteur.name")

    class Meta:
        model = Depense
        fields = [
            "id",
            "numero",
            "code",
            "semaine",
            "categorie",
            "libelle",
            "montant",
            "paye_par",
            "caisse",
            "rattachement",
            "production_jour",
            "production_creneau",
            "matiere",
            "quantite",
            "fournisseur",
            "justificatif",
            "achat_courant",
            "pre_autorisation",
            "statut",
            "auteur",
            "auteur_profil",
            "cree_le",
        ]
        read_only_fields = fields

    def get_code(self, depense: Depense) -> str:
        """« DEP-0042 »."""
        return numero_affiche(depense.numero)


class NouvelleDepenseSerializer(serializers.Serializer):
    categorie = serializers.ChoiceField(choices=CATEGORIES)
    libelle = serializers.CharField(max_length=200)
    montant = serializers.IntegerField(min_value=1)
    paye_par = serializers.ChoiceField(choices=[p.value for p in PayePar])
    rattachement = serializers.ChoiceField(choices=[r.value for r in Rattachement])
    matiere = serializers.CharField(max_length=30, required=False, default="")
    quantite = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        required=False,
        allow_null=True,
    )
    fournisseur = serializers.CharField(
        max_length=150,
        required=False,
        default="",
        help_text="Fournisseur ou marché, pour un achat qui entre en stock.",
    )
    justificatif = serializers.FileField(required=False, allow_null=True)
    achat_courant = serializers.ChoiceField(
        choices=[a.value for a in AchatCourant],
        required=False,
        default="",
        allow_blank=True,
        help_text="Bois, levure… : entre dans la pré-autorisation de la semaine (O7).",
    )

    def validate_justificatif(self, fichier: Any) -> Any:
        if fichier is None:
            return fichier
        if fichier.size > TAILLE_MAX:
            message = "Le justificatif dépasse 5 Mo."
            raise serializers.ValidationError(message)
        type_fichier = getattr(fichier, "content_type", "") or ""
        if not type_fichier.startswith(TYPES_JUSTIFICATIF):
            message = "Photo ou PDF attendu."
            raise serializers.ValidationError(message)
        return fichier

    def depense(self) -> NouvelleDepense:
        donnees = self.validated_data
        return NouvelleDepense(
            categorie=Categorie(donnees["categorie"]),
            libelle=donnees["libelle"],
            montant=donnees["montant"],
            paye_par=PayePar(donnees["paye_par"]),
            rattachement=Rattachement(donnees["rattachement"]),
            matiere=donnees["matiere"],
            quantite=donnees.get("quantite"),
            fournisseur=donnees["fournisseur"],
            achat_courant=donnees["achat_courant"],
        )


class PreAutorisationSerializer(serializers.Serializer):
    achat_courant = serializers.CharField()
    plafond = serializers.IntegerField()
    engage = serializers.IntegerField(help_text="Dépenses déjà rattachées, en FCFA.")
    reste = serializers.IntegerField()


class PlafondsSerializer(serializers.Serializer):
    plafonds = serializers.DictField(
        child=serializers.IntegerField(min_value=0),
        help_text="Achat courant → plafond de la semaine en FCFA ; 0 le retire.",
    )


def _pre_autorisations() -> list[dict[str, Any]]:
    semaine = depots.semaines.ouverte()
    if semaine is None:
        return []
    lignes = []
    for pre in PreAutorisation.objects.filter(semaine_id=semaine.id):
        deja = engage(pre)
        lignes.append(
            {
                "achat_courant": pre.achat_courant,
                "plafond": pre.plafond,
                "engage": deja,
                "reste": pre.plafond - deja,
            },
        )
    return lignes


class PreAutorisationsViewSet(ViewSet):
    """Achats courants pré-autorisés de la semaine ouverte (O7)."""

    def get_permissions(self):
        if self.action == "list":
            return [ProfilParmi("caissier", "production", *DIRECTION)()]
        return [ProfilParmi(*DIRECTION)()]

    @extend_schema(responses=PreAutorisationSerializer(many=True))
    def list(self, request: Request) -> Response:
        return Response(PreAutorisationSerializer(_pre_autorisations(), many=True).data)

    @extend_schema(
        request=PlafondsSerializer,
        responses={200: PreAutorisationSerializer(many=True), 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["put"])
    def fixer(self, request: Request) -> Response:
        """Le gérant fixe en début de semaine un plafond par achat courant."""
        corps = PlafondsSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                cas.fixer_pre_autorisations(
                    depots,
                    plafonds=corps.validated_data["plafonds"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(PreAutorisationSerializer(_pre_autorisations(), many=True).data)


class DepensesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """La caisse et la production voient leurs dépenses ; la direction toutes."""

    serializer_class = DepenseSerializer
    queryset = Depense.objects.select_related("auteur", "matiere")
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi("caissier", "production", *DIRECTION)()]
        return [ProfilParmi(*SAISISSENT)()]

    def get_queryset(self) -> QuerySet[Depense]:
        depenses = super().get_queryset()
        if profil_de(self.request) not in DIRECTION:
            depenses = depenses.filter(auteur_id=self.request.user.pk)
        for filtre in ("semaine", "categorie", "statut"):
            if valeur := self.request.query_params.get(filtre):
                depenses = depenses.filter(**{filtre: valeur})
        return depenses

    @extend_schema(
        parameters=[
            OpenApiParameter("semaine", int),
            OpenApiParameter("categorie", str),
            OpenApiParameter("statut", str),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request={"multipart/form-data": NouvelleDepenseSerializer},
        parameters=[IDEMPOTENCE],
        responses={201: DepenseSerializer, 409: ProblemeSerializer},
    )
    @idempotent
    def create(self, request: Request) -> Response:
        """DEP-xxxx ; avec la photo du justificatif ; la caisse paie si choisie."""
        corps = NouvelleDepenseSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                etat = cas.saisir(
                    depots,
                    depense=corps.depense(),
                    session_production=session_de_production(timezone.now(), limites()),
                    justificatif=corps.validated_data.get("justificatif"),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            DepenseSerializer(Depense.objects.get(pk=etat.id)).data,
            status=status.HTTP_201_CREATED,
        )
