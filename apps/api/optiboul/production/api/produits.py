"""Produits et fiches techniques versionnées (US-080, CdC §5.5)."""

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
from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.journal import journaliser
from optiboul.production.application import produits as cas
from optiboul.production.application.produits import MODIFIENT_LES_FICHES
from optiboul.production.domain.fiches import Fiche
from optiboul.production.domain.fiches import boules_par_sac
from optiboul.production.infrastructure.models import FicheTechnique
from optiboul.production.infrastructure.models import Produit
from optiboul.production.infrastructure.produits import depot_fiches
from optiboul.production.infrastructure.produits import fiche_de
from optiboul.production.infrastructure.produits import fiche_en_cours

if TYPE_CHECKING:
    from rest_framework.request import Request

Recette = serializers.DictField(
    child=serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0),
    help_text="Code de la matière → quantité pour un sac de 50 kg.",
)


class FicheSerializer(serializers.ModelSerializer[FicheTechnique]):
    boules_par_sac = serializers.SerializerMethodField()
    recette = serializers.SerializerMethodField()

    class Meta:
        model = FicheTechnique
        fields = [
            "version",
            "poids_boule",
            "pains_par_boule",
            "pains_par_sac",
            "boules_par_sac",
            "procede",
            "recette",
            "cree_par_nom",
            "cree_le",
        ]
        read_only_fields = fields

    @extend_schema(
        responses=serializers.DecimalField(max_digits=6, decimal_places=2),
    )
    def get_boules_par_sac(self, fiche: FicheTechnique) -> str:
        return str(boules_par_sac(fiche_de(fiche)))

    @extend_schema(responses=Recette)
    def get_recette(self, fiche: FicheTechnique) -> dict[str, str]:
        return {r.matiere.code: str(r.quantite) for r in fiche.recette.all()}


class NouvelleFicheSerializer(serializers.Serializer):
    poids_boule = serializers.IntegerField(min_value=1)
    pains_par_boule = serializers.IntegerField(min_value=1)
    pains_par_sac = serializers.IntegerField(min_value=1)
    procede = serializers.CharField(allow_blank=True, required=False, default="")
    recette = serializers.DictField(
        child=serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0),
    )


class ProduitSerializer(serializers.ModelSerializer[Produit]):
    fiche = serializers.SerializerMethodField()

    class Meta:
        model = Produit
        fields = ["id", "code", "nom", "nom_en", "prix", "actif", "ordre", "fiche"]
        read_only_fields = ["id", "fiche"]

    @extend_schema(responses=FicheSerializer(allow_null=True))
    def get_fiche(self, produit: Produit) -> dict[str, Any] | None:
        """Version en cours de la fiche technique."""
        fiche = fiche_en_cours(produit.pk)
        return FicheSerializer(fiche).data if fiche else None


def _valeurs(produit: Produit) -> dict[str, Any]:
    return {
        champ: getattr(produit, champ)
        for champ in ("code", "nom", "nom_en", "prix", "actif", "ordre")
    }


class ProduitsViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """Tous les profils lisent les produits ; propriétaire et administrateur les gèrent.

    Un produit n'est jamais supprimé : il est désactivé (`actif`), ses ventes restent.
    """

    serializer_class = ProduitSerializer
    queryset = Produit.objects.all()
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve", "fiches"}:
            return [ProfilParmi(*TOUS_LES_PROFILS)()]
        return [ProfilParmi(*MODIFIENT_LES_FICHES)()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        produit = serializer.save()
        journaliser(
            "produit.cree",
            auteur=auteur_de(self.request),
            objet_type="produit",
            objet_id=produit.pk,
            apres=_valeurs(produit),
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        assert serializer.instance is not None
        avant = _valeurs(serializer.instance)
        produit = serializer.save()
        journaliser(
            "produit.modifie",
            auteur=auteur_de(self.request),
            objet_type="produit",
            objet_id=produit.pk,
            avant=avant,
            apres=_valeurs(produit),
        )

    @extend_schema(responses=FicheSerializer(many=True))
    @action(detail=True)
    def fiches(self, request: Request, pk: str) -> Response:
        """Toutes les versions de la fiche, la plus récente d'abord."""
        versions = (
            FicheTechnique.objects.filter(produit=self.get_object())
            .prefetch_related("recette__matiere")
            .order_by("-version")
        )
        return Response(FicheSerializer(versions, many=True).data)

    @extend_schema(
        request=NouvelleFicheSerializer,
        responses={201: FicheSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"], url_path="nouvelle-version")
    def nouvelle_version(self, request: Request, pk: str) -> Response:
        """Rendement, recette d'un sac et procédé ; la version précédente reste."""
        produit = self.get_object()
        corps = NouvelleFicheSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        try:
            with transaction.atomic():
                cas.nouvelle_version(
                    depot_fiches,
                    journal,
                    produit_id=produit.pk,
                    fiche=Fiche(
                        poids_boule=donnees["poids_boule"],
                        pains_par_boule=donnees["pains_par_boule"],
                        pains_par_sac=donnees["pains_par_sac"],
                        procede=donnees["procede"],
                        recette=dict(donnees["recette"]),
                    ),
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        fiche = fiche_en_cours(produit.pk)
        return Response(FicheSerializer(fiche).data, status=status.HTTP_201_CREATED)
