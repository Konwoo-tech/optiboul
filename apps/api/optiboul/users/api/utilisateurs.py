"""Comptes vus par l'administrateur (CdC §5.12) : groupe, déblocage après échecs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.models import Group
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.journal import journaliser
from optiboul.users import comptes
from optiboul.users import connexion
from optiboul.users import groupes
from optiboul.users import verrouillage
from optiboul.users.domain.comptes import CompteInvalide
from optiboul.users.domain.comptes import apercu
from optiboul.users.domain.comptes import normaliser_gmail
from optiboul.users.domain.comptes import normaliser_telephone
from optiboul.users.models import Profil
from optiboul.users.models import User

if TYPE_CHECKING:
    from rest_framework.request import Request


class CompteSerializer(serializers.ModelSerializer[User]):
    profil = serializers.ChoiceField(
        choices=Profil.choices,
        read_only=True,
        allow_null=True,
    )
    groupe = serializers.SerializerMethodField()
    bloque = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "groupe",
            "profil",
            "is_active",
            "bloque",
            "bloque_jusqua",
        ]
        read_only_fields = fields

    def get_groupe(self, utilisateur: User) -> int | None:
        groupe = utilisateur.groups.first()
        return groupe.pk if groupe else None

    def get_bloque(self, utilisateur: User) -> bool:
        return verrouillage.est_bloque(utilisateur)


class ChangementGroupeSerializer(serializers.Serializer):
    groupe = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.filter(profil_droits__isnull=False),
    )


class NouveauCompteSerializer(serializers.Serializer):
    """Les 3 étapes (CdC §5.12) : identité, groupe, canal de vérification."""

    nom = serializers.CharField(max_length=255)
    email = serializers.CharField(max_length=254)
    telephone = serializers.CharField(max_length=30)
    groupe = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.filter(profil_droits__isnull=False),
    )
    canal = serializers.ChoiceField(choices=["sms", "whatsapp"], default="whatsapp")
    code = serializers.RegexField(r"^\d{4}$", required=False, allow_blank=True)

    def validate_email(self, email: str) -> str:
        try:
            adresse = normaliser_gmail(email)
        except CompteInvalide as erreur:
            raise serializers.ValidationError(str(erreur)) from erreur
        if User.objects.filter(email__iexact=adresse).exists():
            message = "Cette adresse Gmail a déjà un compte."
            raise serializers.ValidationError(message)
        return adresse

    def validate_telephone(self, telephone: str) -> str:
        try:
            return normaliser_telephone(telephone)
        except CompteInvalide as erreur:
            raise serializers.ValidationError(str(erreur)) from erreur


class CompteCreeSerializer(CompteSerializer):
    codesSecours = serializers.ListField(  # noqa: N815
        child=serializers.CharField(),
        read_only=True,
    )

    class Meta(CompteSerializer.Meta):
        fields = [*CompteSerializer.Meta.fields, "codesSecours"]
        read_only_fields = fields


class ApercuSerializer(serializers.Serializer):
    groupe = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.filter(profil_droits__isnull=False),
    )


class AccesSerializer(serializers.Serializer):
    profil = serializers.CharField()
    espaces = serializers.ListField(child=serializers.CharField())
    accueil = serializers.CharField(allow_null=True)
    fonctions = serializers.ListField(child=serializers.CharField())


class ModificationCompteSerializer(serializers.Serializer):
    """Tous les champs sont facultatifs (#302)."""

    is_active = serializers.BooleanField(required=False)
    name = serializers.CharField(max_length=255, required=False)
    telephone = serializers.CharField(max_length=30, required=False)
    canal = serializers.ChoiceField(choices=["sms", "whatsapp"], required=False)

    def validate_name(self, nom: str) -> str:
        if not nom.strip():
            message = "Le nom est obligatoire."
            raise serializers.ValidationError(message)
        return nom.strip()

    def validate_telephone(self, telephone: str) -> str:
        try:
            return normaliser_telephone(telephone)
        except CompteInvalide as erreur:
            raise serializers.ValidationError(str(erreur)) from erreur


def _valeurs_du_compte(utilisateur: User) -> dict[str, object]:
    return {
        "name": utilisateur.name,
        "telephone": utilisateur.telephone,
        "canal": utilisateur.canal_verification,
        "is_active": utilisateur.is_active,
    }


def _refuser(code: str, message: str) -> Response:
    return Response({"detail": message, "code": code}, status=status.HTTP_409_CONFLICT)


class CodeSerializer(serializers.Serializer):
    code = serializers.RegexField(r"^\d{4}$")


class UtilisateursViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = CompteSerializer
    http_method_names = ["get", "post", "patch"]

    @extend_schema(
        request=ModificationCompteSerializer,
        responses={200: CompteSerializer, 409: ProblemeSerializer},
    )
    def partial_update(self, request: Request, pk: str) -> Response:
        """Nom, téléphone, canal ; désactiver coupe aussi la session ouverte (#302)."""
        utilisateur = self.get_object()
        corps = ModificationCompteSerializer(data=request.data)
        if not corps.is_valid():
            return Response(
                {
                    "detail": "Champs invalides.",
                    "code": "champs_invalides",
                    "champs": corps.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        donnees = corps.validated_data
        desactiver = donnees.get("is_active") is False and utilisateur.is_active
        if desactiver and utilisateur.pk == request.user.pk:
            return _refuser(
                "compte_propre",
                "Vous ne désactivez pas votre propre compte.",
            )
        if desactiver and utilisateur.profil == Profil.ADMINISTRATEUR:
            autres = [
                u
                for u in User.objects.filter(is_active=True).exclude(pk=utilisateur.pk)
                if u.profil == Profil.ADMINISTRATEUR
            ]
            if not autres:
                return _refuser(
                    "dernier_administrateur",
                    "Il faut au moins un administrateur actif.",
                )
        avant = _valeurs_du_compte(utilisateur)
        with transaction.atomic():
            utilisateur.name = donnees.get("name", utilisateur.name)
            utilisateur.telephone = donnees.get("telephone", utilisateur.telephone)
            utilisateur.canal_verification = donnees.get(
                "canal",
                utilisateur.canal_verification,
            )
            utilisateur.is_active = donnees.get("is_active", utilisateur.is_active)
            utilisateur.save()
            apres = _valeurs_du_compte(utilisateur)
            if avant["is_active"] != apres["is_active"]:
                action_journal = (
                    "utilisateur.reactive"
                    if apres["is_active"]
                    else "utilisateur.desactive"
                )
            else:
                action_journal = "utilisateur.modifie"
            if apres != avant:
                journaliser(
                    action_journal,
                    auteur=auteur_de(request),
                    objet_type="utilisateur",
                    objet_id=utilisateur.pk,
                    avant=avant,
                    apres=apres,
                )
        return Response(CompteSerializer(utilisateur).data)

    permission_classes = [ProfilParmi("administrateur")]
    queryset = User.objects.order_by("name", "email")

    @extend_schema(
        request=NouveauCompteSerializer,
        responses={201: CompteCreeSerializer},
    )
    def create(self, request: Request) -> Response:
        corps = NouveauCompteSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        nouveau = comptes.creer(
            nom=donnees["nom"],
            email=donnees["email"],
            telephone=donnees["telephone"],
            groupe=donnees["groupe"],
            canal=donnees["canal"],
            code=donnees.get("code") or None,
            auteur=auteur_de(request),
        )
        reponse = dict(CompteSerializer(nouveau.utilisateur).data)
        # Les codes de secours ne sont montrés qu'une fois, à la création.
        reponse["codesSecours"] = nouveau.codes_secours
        return Response(reponse, status=status.HTTP_201_CREATED)

    @extend_schema(request=ApercuSerializer, responses=AccesSerializer)
    @action(detail=False, methods=["post"])
    def apercu(self, request: Request) -> Response:
        """Étape 2 : ce que le groupe choisi donnera à voir et à faire (CdC §3.3)."""
        corps = ApercuSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        return Response(apercu(corps.validated_data["groupe"].profil_droits.profil))

    @extend_schema(request=CodeSerializer, responses={204: None})
    @action(detail=True, methods=["post"])
    def code(self, request: Request, pk: str) -> Response:
        """Définit ou réinitialise le code à 4 chiffres du comptoir."""
        utilisateur = self.get_object()
        corps = CodeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        connexion.definir_code(utilisateur, corps.validated_data["code"])
        journaliser(
            "utilisateur.code_defini",
            auteur=auteur_de(request),
            objet_type="utilisateur",
            objet_id=utilisateur.pk,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=ChangementGroupeSerializer, responses=CompteSerializer)
    @action(detail=True, methods=["post"])
    def groupe(self, request: Request, pk: str) -> Response:
        """Change la personne de groupe : ses droits changent aussitôt (US-021)."""
        utilisateur = self.get_object()
        corps = ChangementGroupeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        groupes.changer_de_groupe(
            utilisateur,
            corps.validated_data["groupe"],
            auteur_de(request),
        )
        return Response(CompteSerializer(utilisateur).data)

    @extend_schema(request=None, responses=CompteSerializer)
    @action(detail=True, methods=["post"])
    def debloquer(self, request: Request, pk: str) -> Response:
        utilisateur = self.get_object()
        verrouillage.debloquer(utilisateur, auteur_de(request))
        return Response(CompteSerializer(utilisateur).data)
