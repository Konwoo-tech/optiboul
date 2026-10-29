"""Points de connexion de l'application web (CdC §4.1, spécification §6.2 /auth/)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.decorators import throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.contexte import entree_de
from optiboul.core.application.journal import Entree
from optiboul.users import connexion
from optiboul.users.models import Profil
from optiboul.users.verrouillage import LimiteParCompte
from optiboul.users.verrouillage import LimiteParPoste

if TYPE_CHECKING:
    from rest_framework.request import Request


def probleme(refus: connexion.RefusConnexion) -> Response:
    """Erreur au format de l'application web : { detail, code, … } (RFC 9457)."""
    return Response(
        {"detail": refus.detail, "code": refus.code, **refus.autres},
        status=refus.statut,
    )


class PersonneDuPosteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField(source="name")
    profil = serializers.ChoiceField(choices=Profil.choices, allow_null=True)


class ConnexionCodeSerializer(serializers.Serializer):
    utilisateur = serializers.IntegerField()
    code = serializers.CharField(max_length=4, min_length=4)


class ResultatConnexionSerializer(serializers.Serializer):
    deuxFacteurs = serializers.BooleanField()  # noqa: N815 : nom attendu par le web


class ProblemeSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()


def exiger_csrf(request: Request) -> None:
    """Même anonyme, une connexion exige le jeton CSRF (contre la connexion forcée)."""
    SessionAuthentication().enforce_csrf(request)


def _poste_requis(request: Request) -> connexion.RefusConnexion | None:
    if entree_de(request) is Entree.DISTANTE:
        return connexion.RefusConnexion("code_interdit_a_distance")
    if getattr(request._request, "poste_confiance", None) is None:  # noqa: SLF001
        return connexion.RefusConnexion("poste_non_reconnu")
    return None


@extend_schema(
    responses={200: PersonneDuPosteSerializer(many=True), 403: ProblemeSerializer},
)
@api_view(["GET"])
@permission_classes([AllowAny])
def utilisateurs_du_poste(request: Request) -> Response:
    """Les noms à toucher sur le poste de confiance du comptoir (O1)."""
    get_token(request._request)  # noqa: SLF001 : cookie CSRF pour la connexion qui suit
    if refus := _poste_requis(request):
        return probleme(refus)
    personnes = connexion.utilisateurs_du_poste()
    return Response(PersonneDuPosteSerializer(personnes, many=True).data)


@extend_schema(
    request=ConnexionCodeSerializer,
    responses={200: ResultatConnexionSerializer, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParCompte, LimiteParPoste])
def connexion_par_code(request: Request) -> Response:
    """Nom + code à 4 chiffres, vérifié dès le 4ᵉ chiffre (US-010)."""
    exiger_csrf(request)
    if refus := _poste_requis(request):
        return probleme(refus)
    corps = ConnexionCodeSerializer(data=request.data)
    if not corps.is_valid():
        return probleme(connexion.RefusConnexion(connexion.INCORRECT))
    try:
        identifie = connexion.verifier_code(
            corps.validated_data["utilisateur"],
            corps.validated_data["code"],
            auteur_de(request),
        )
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    connexion.ouvrir_session(request._request, identifie)  # noqa: SLF001
    return Response({"deuxFacteurs": False})
