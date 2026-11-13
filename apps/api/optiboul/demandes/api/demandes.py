"""Demandes de validation (US-070, CdC §5.9) : DEM-xxx, objet lié, motif."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.contexte import entree_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Entree
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.demandes.application import demandes as cas
from optiboul.demandes.domain.demandes import StatutDemande
from optiboul.demandes.domain.demandes import Via
from optiboul.demandes.domain.demandes import numero_affiche
from optiboul.demandes.infrastructure.demandes import depots
from optiboul.demandes.infrastructure.models import Demande
from optiboul.users.connexion import RefusConnexion
from optiboul.users.connexion import verifier_code
from optiboul.users.models import Profil
from optiboul.users.models import User

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class EmetteurSerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True)
    nom = serializers.CharField()


PROFILS_VALIDEURS = ("gerant", "proprietaire")


class ValideurPossibleSerializer(serializers.Serializer):
    profil = serializers.CharField()
    nom = serializers.CharField()


def valideur_par_profil(profil: str) -> User | None:
    """Le gérant de la semaine ouverte, ou le propriétaire (premier compte actif)."""
    if profil == "gerant":
        semaine = depot_semaines.ouverte()
        if semaine is None or semaine.gerant is None:
            return None
        return User.objects.filter(pk=semaine.gerant, is_active=True).first()
    return next(
        (u for u in User.objects.filter(is_active=True) if u.profil == profil),
        None,
    )


class DemandeSerializer(serializers.ModelSerializer[Demande]):
    code = serializers.SerializerMethodField()
    type_libelle = serializers.SerializerMethodField()
    emetteur = serializers.SerializerMethodField()
    valideurs_possibles = serializers.SerializerMethodField()

    class Meta:
        model = Demande
        fields = [
            "id",
            "numero",
            "code",
            "type",
            "type_libelle",
            "objet_type",
            "objet_id",
            "objet",
            "details",
            "motif",
            "emetteur",
            "emetteur_profil",
            "valideurs",
            "valideurs_possibles",
            "statut",
            "cree_le",
            "echeance",
            "escaladee_le",
            "decide_par_nom",
            "decide_le",
            "motif_refus",
            "via",
        ]
        read_only_fields = fields

    def get_code(self, demande: Demande) -> str:
        """« DEM-021 »."""
        return numero_affiche(demande.numero)

    def get_type_libelle(self, demande: Demande) -> str:
        type_demande = cas.types().get(demande.type)
        return type_demande.libelle if type_demande else demande.type

    @extend_schema(responses=EmetteurSerializer)
    def get_emetteur(self, demande: Demande) -> dict[str, Any]:
        return {"id": demande.emetteur_id, "nom": demande.emetteur_nom}

    @extend_schema_field(ValideurPossibleSerializer(many=True))
    def get_valideurs_possibles(self, demande: Demande) -> list[dict[str, str]]:
        """Qui peut décider par code sur ce poste, émetteur exclu (#316)."""
        if demande.statut != StatutDemande.EN_ATTENTE:
            return []
        if not hasattr(self, "_valideurs"):
            self._valideurs = {p: valideur_par_profil(p) for p in PROFILS_VALIDEURS}
        profils = [
            p
            for p in PROFILS_VALIDEURS
            if p == "proprietaire" or p in (demande.valideurs or [])
        ]
        return [
            {"profil": profil, "nom": valideur.name or valideur.email}
            for profil in profils
            if (valideur := self._valideurs[profil]) is not None
            and valideur.pk != demande.emetteur_id
        ]


class CodeGerantSerializer(serializers.Serializer):
    """Le gérant décide sur le poste de la caissière, sans changer d'utilisateur.

    Le valideur est désigné par son identifiant, ou par son profil (#316) : le
    gérant de la semaine ouverte, ou le propriétaire.
    """

    utilisateur = serializers.IntegerField(required=False)
    profil = serializers.ChoiceField(
        choices=Profil.choices,
        required=False,
        help_text="gerant (de la semaine ouverte) ou proprietaire.",
    )
    code = serializers.CharField(max_length=4, min_length=4)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if ("utilisateur" in attrs) == ("profil" in attrs):
            message = "Indiquez soit l'utilisateur, soit le profil du valideur."
            raise serializers.ValidationError(message)
        if attrs.get("profil", "gerant") not in PROFILS_VALIDEURS:
            message = "Le valideur est le gérant ou le propriétaire."
            raise serializers.ValidationError({"profil": message})
        return attrs


class AccordSerializer(serializers.Serializer):
    code_gerant = CodeGerantSerializer(required=False)


class RefusSerializer(AccordSerializer):
    motif = serializers.CharField(max_length=500)


class EmissionSerializer(serializers.Serializer):
    type = serializers.CharField(max_length=30)
    objet_id = serializers.IntegerField(min_value=1)
    motif = serializers.CharField(max_length=500)


def visibles(demandes: QuerySet[Demande], request: Request) -> QuerySet[Demande]:
    """L'émetteur, les valideurs et le propriétaire voient la demande."""
    profil = profil_de(request)
    if profil == "proprietaire":
        return demandes
    return demandes.filter(
        Q(emetteur_id=request.user.pk) | Q(valideurs__contains=[profil]),
    )


def decideur_de(
    request: Request,
    code_gerant: dict[str, Any] | None,
) -> tuple[Auteur, Via]:
    """La personne connectée, ou le gérant qui saisit son code sur ce poste (§4.3)."""
    auteur = auteur_de(request)
    if not code_gerant:
        via = Via.DISTANCE if entree_de(request) is Entree.DISTANTE else Via.POSTE
        return auteur, via
    utilisateur = code_gerant.get("utilisateur")
    if utilisateur is None:
        valideur = valideur_par_profil(code_gerant["profil"])
        if valideur is None:
            message = "Aucun valideur de ce profil n'est disponible."
            refus = RefusMetier("valideur_introuvable", message)
            raise refus
        utilisateur = valideur.pk
    identifie = verifier_code(utilisateur, code_gerant["code"], auteur)
    gerant = identifie.utilisateur
    signe = Auteur(
        utilisateur_id=gerant.pk,
        nom=gerant.name or gerant.email,
        profil=gerant.profil or "",
        poste_id=auteur.poste_id,
        poste=auteur.poste,
        entree=auteur.entree,
        adresse_ip=auteur.adresse_ip,
    )
    return signe, Via.CODE


class DemandesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = DemandeSerializer
    permission_classes = [ProfilParmi(*TOUS_LES_PROFILS)]
    queryset = Demande.objects.all()

    def get_queryset(self) -> QuerySet[Demande]:
        demandes = visibles(super().get_queryset(), self.request)
        for filtre in ("statut", "type"):
            if valeur := self.request.query_params.get(filtre):
                demandes = demandes.filter(**{filtre: valeur})
        return demandes

    @extend_schema(
        parameters=[
            OpenApiParameter("statut", str, enum=[s.value for s in StatutDemande]),
            OpenApiParameter("type", str),
        ],
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=EmissionSerializer,
        responses={201: DemandeSerializer, 409: ProblemeSerializer},
    )
    def create(self, request: Request) -> Response:
        """Émet une demande liée à l'objet bloqué ; les valideurs sont prévenus."""
        corps = EmissionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                demande = cas.emettre(
                    depots,
                    type_cle=corps.validated_data["type"],
                    objet_id=corps.validated_data["objet_id"],
                    motif=corps.validated_data["motif"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            DemandeSerializer(Demande.objects.get(pk=demande.id)).data,
            status=status.HTTP_201_CREATED,
        )

    def _decider(self, request: Request, *, accord: bool) -> Response:
        corps = (AccordSerializer if accord else RefusSerializer)(data=request.data)
        corps.is_valid(raise_exception=True)
        demande_id = self.get_object().pk
        try:
            # Hors de la transaction : un code faux reste compté (verrouillage, US-155).
            decideur, via = decideur_de(
                request,
                corps.validated_data.get("code_gerant"),
            )
            with transaction.atomic():
                cas.decider(
                    depots,
                    demande_id=demande_id,
                    accord=accord,
                    motif=corps.validated_data.get("motif", ""),
                    decideur=decideur,
                    via=via,
                    maintenant=timezone.now(),
                )
        except RefusConnexion as refus:
            return Response(
                {"detail": refus.detail, "code": refus.code, **refus.autres},
                status=refus.statut,
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(DemandeSerializer(Demande.objects.get(pk=demande_id)).data)

    @extend_schema(
        request=AccordSerializer,
        responses={200: DemandeSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def accorder(self, request: Request, pk: str) -> Response:
        """Accord en un clic ; l'objet lié change de statut automatiquement."""
        return self._decider(request, accord=True)

    @extend_schema(
        request=RefusSerializer,
        responses={200: DemandeSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def refuser(self, request: Request, pk: str) -> Response:
        """Refus motivé ; l'émetteur est prévenu."""
        return self._decider(request, accord=False)

    @extend_schema(responses=DemandeSerializer(many=True))
    @action(detail=False, url_path="en-attente", pagination_class=None)
    def en_attente(self, request: Request) -> Response:
        """Demandes que mon profil peut trancher, les plus anciennes d'abord.

        Les demandes que j'ai émises n'y sont pas : `GET /demandes/?statut=en_attente`
        les liste (#316).
        """
        demandes = Demande.objects.filter(
            statut=StatutDemande.EN_ATTENTE,
            valideurs__contains=[profil_de(request)],
        ).order_by("cree_le", "id")
        return Response(DemandeSerializer(demandes, many=True).data)
