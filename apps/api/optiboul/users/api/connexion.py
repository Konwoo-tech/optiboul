"""Points de connexion de l'application web (CdC §4.1, spécification §6.2 /auth/)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.decorators import throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.contexte import entree_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.application.journal import Entree
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.users import comptes
from optiboul.users import connexion
from optiboul.users import double_auth
from optiboul.users import google
from optiboul.users import mot_de_passe
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
    return _terminer_ou_demander(request, identifie)


def _terminer_ou_demander(request: Request, identifie: connexion.Identifie) -> Response:
    """Ouvre la session, ou attend le second facteur quand il est requis (CdC §4.1)."""
    brute = request._request  # noqa: SLF001
    if double_auth.requise(brute, identifie):
        return Response(double_auth.demarrer(brute, identifie))
    double_auth.terminer(brute, identifie)
    return Response({"deuxFacteurs": False})


class ConnexionEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    motDePasse = serializers.CharField(trim_whitespace=False)  # noqa: N815


class EnvoiCodeSerializer(serializers.Serializer):
    canal = serializers.ChoiceField(choices=["sms", "whatsapp"])


class CodeEnvoyeSerializer(serializers.Serializer):
    heure = serializers.CharField()
    canal = serializers.CharField()
    telephoneMasque = serializers.CharField()  # noqa: N815
    renvoiDans = serializers.IntegerField()  # noqa: N815


class VerificationSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=12)


@extend_schema(
    request=ConnexionEmailSerializer,
    responses={200: ResultatConnexionSerializer, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParCompte, LimiteParPoste])
def connexion_par_email(request: Request) -> Response:
    """E-mail + mot de passe : double authentification à chaque connexion."""
    exiger_csrf(request)
    corps = ConnexionEmailSerializer(data=request.data)
    if not corps.is_valid():
        return probleme(connexion.RefusConnexion("identifiants_incorrects"))
    try:
        identifie = connexion.verifier_mot_de_passe(
            request._request,  # noqa: SLF001
            corps.validated_data["email"],
            corps.validated_data["motDePasse"],
            auteur_de(request),
        )
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    return _terminer_ou_demander(request, identifie)


@extend_schema(
    request=EnvoiCodeSerializer,
    responses={200: CodeEnvoyeSerializer, 409: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
def envoyer_code(request: Request) -> Response:
    """Code à 6 chiffres par SMS ou WhatsApp (renvoi après 30 s, bascule de canal)."""
    exiger_csrf(request)
    corps = EnvoiCodeSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    try:
        envoi = double_auth.envoyer_code(
            request._request,  # noqa: SLF001
            corps.validated_data["canal"],
        )
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    return Response(envoi)


@extend_schema(
    request=VerificationSerializer,
    responses={204: None, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def verifier_code(request: Request) -> Response:
    """Code reçu, vérifié dès le 6ᵉ chiffre ; 3 essais puis nouveau code."""
    exiger_csrf(request)
    corps = VerificationSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    brute = request._request  # noqa: SLF001
    try:
        identifie = double_auth.verifier(brute, corps.validated_data["code"])
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    double_auth.terminer(brute, identifie)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([AllowAny])
def annuler_identification(request: Request) -> Response:
    double_auth.annuler(request._request)  # noqa: SLF001
    return Response(status=status.HTTP_204_NO_CONTENT)


RAISONS_DECONNEXION = ["volontaire", "inactivite"]


class DeconnexionSerializer(serializers.Serializer):
    raison = serializers.ChoiceField(
        choices=RAISONS_DECONNEXION,
        required=False,
        default="volontaire",
        help_text="« inactivite » : fermée par le minuteur du poste (#299).",
    )


@extend_schema(
    request=DeconnexionSerializer,
    responses={204: None, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
def deconnexion(request: Request) -> Response:
    corps = DeconnexionSerializer(data=request.data)
    if not corps.is_valid():
        return probleme(connexion.RefusConnexion("raison_invalide"))
    if request.user.is_authenticated:
        inactivite = corps.validated_data["raison"] == "inactivite"
        journaliser(
            "connexion.expiree" if inactivite else "connexion.fermee",
            auteur=auteur_de(request),
            objet_type="utilisateur",
            objet_id=request.user.pk,
        )
    logout(request._request)  # noqa: SLF001
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=VerificationSerializer,
    responses={204: None, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def verifier_application(request: Request) -> Response:
    """Sans réseau : code de l'application d'authentification ou code de secours."""
    exiger_csrf(request)
    corps = VerificationSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    brute = request._request  # noqa: SLF001
    try:
        identifie = double_auth.verifier_application(
            brute,
            corps.validated_data["code"],
        )
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    double_auth.terminer(brute, identifie)
    return Response(status=status.HTTP_204_NO_CONTENT)


class SessionSerializer(serializers.Serializer):
    via = serializers.CharField(allow_blank=True)
    inactiviteMinutes = serializers.IntegerField(allow_null=True)  # noqa: N815


@extend_schema(responses=SessionSerializer)
@api_view(["GET"])
def session_en_cours(request: Request) -> Response:
    """Méthode de connexion et délai d'inactivité, pour le minuteur de l'écran."""
    via = request.session.get(connexion.SESSION_VIA, "")
    minutes = parametre("inactivite_comptoir") if via == "code" else None
    return Response({"via": via, "inactiviteMinutes": minutes})


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
def changer_utilisateur(request: Request) -> Response:
    """« Changer d'utilisateur » : la session se ferme ; poste et brouillons restent."""
    journaliser(
        "connexion.changement",
        auteur=auteur_de(request),
        objet_type="utilisateur",
    )
    logout(request._request)  # noqa: SLF001
    return Response(status=status.HTTP_204_NO_CONTENT)


class ConfigurationGoogleSerializer(serializers.Serializer):
    client_id = serializers.CharField(
        allow_blank=True,
        help_text="Identifiant OAuth public du client web ; vide : bouton masqué.",
    )
    jetons_de_test = serializers.BooleanField(
        help_text="En local : un jeton « test:<gmail> » est accepté.",
    )


@extend_schema(responses=ConfigurationGoogleSerializer)
@api_view(["GET"])
@permission_classes([AllowAny])
def configuration_google(request: Request) -> Response:
    """Ce que le bouton « Continuer avec Google » doit savoir (#306)."""
    return Response(
        {
            "client_id": settings.OPTIBOUL_GOOGLE_CLIENT_ID,
            "jetons_de_test": google.jetons_de_test_actifs(),
        },
    )


class ConnexionGoogleSerializer(serializers.Serializer):
    jeton = serializers.CharField(
        help_text="Jeton d'identité de Google Identity Services.",
    )


@extend_schema(
    request=ConnexionGoogleSerializer,
    responses={200: ResultatConnexionSerializer, 403: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def connexion_google(request: Request) -> Response:
    """Seuls les Gmail enregistrés ; la double authentification suit (CdC §4.1)."""
    exiger_csrf(request)
    corps = ConnexionGoogleSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    try:
        identifie = google.identifier(corps.validated_data["jeton"], auteur_de(request))
    except connexion.RefusConnexion as refus:
        return probleme(refus)
    return _terminer_ou_demander(request, identifie)


class MotDePasseOublieSerializer(serializers.Serializer):
    email = serializers.EmailField()


class NouveauMotDePasseSerializer(serializers.Serializer):
    jeton = serializers.CharField()
    motDePasse = serializers.CharField(trim_whitespace=False)  # noqa: N815


@extend_schema(request=MotDePasseOublieSerializer, responses={204: None})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def mot_de_passe_oublie(request: Request) -> Response:
    """Un lien valable une heure part par e-mail ; même réponse si l'adresse est
    inconnue."""
    exiger_csrf(request)
    corps = MotDePasseOublieSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    mot_de_passe.demander(corps.validated_data["email"], auteur_de(request))
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=NouveauMotDePasseSerializer,
    responses={204: None, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def nouveau_mot_de_passe(request: Request) -> Response:
    """Le lien reçu : la personne choisit un nouveau mot de passe."""
    exiger_csrf(request)
    corps = NouveauMotDePasseSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    donnees = corps.validated_data
    try:
        validate_password(donnees["motDePasse"])
    except DjangoValidationError as erreur:
        return Response(
            {"detail": " ".join(erreur.messages), "code": "mot_de_passe_faible"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if mot_de_passe.reinitialiser(
        donnees["jeton"],
        donnees["motDePasse"],
        auteur_de(request),
    ):
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(
        {"detail": "Lien invalide, expiré ou déjà utilisé.", "code": "lien_invalide"},
        status=status.HTTP_400_BAD_REQUEST,
    )


class InvitationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    jeton = serializers.CharField()
    motDePasse = serializers.CharField(trim_whitespace=False)  # noqa: N815


@extend_schema(
    request=InvitationSerializer,
    responses={204: None, 400: ProblemeSerializer},
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LimiteParPoste])
def accepter_invitation(request: Request) -> Response:
    """Lien de l'invitation (US-020) : la personne choisit son mot de passe."""
    exiger_csrf(request)
    corps = InvitationSerializer(data=request.data)
    corps.is_valid(raise_exception=True)
    donnees = corps.validated_data
    try:
        validate_password(donnees["motDePasse"])
    except DjangoValidationError as erreur:
        return Response(
            {"detail": " ".join(erreur.messages), "code": "mot_de_passe_faible"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if comptes.accepter_invitation(
        donnees["uid"],
        donnees["jeton"],
        donnees["motDePasse"],
    ):
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response(
        {
            "detail": "Lien d'invitation invalide ou expiré.",
            "code": "invitation_invalide",
        },
        status=status.HTTP_400_BAD_REQUEST,
    )
