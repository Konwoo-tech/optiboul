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
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.parsers import FormParser
from rest_framework.parsers import JSONParser
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

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
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import numero_affiche
from optiboul.depenses.infrastructure.depenses import depots
from optiboul.depenses.infrastructure.models import CATEGORIES
from optiboul.depenses.infrastructure.models import Depense
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
        )


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
