from django.urls import path
from rest_framework.routers import SimpleRouter

from .brouillons import BrouillonsViewSet
from .connexion import accepter_invitation
from .connexion import annuler_identification
from .connexion import changer_utilisateur
from .connexion import connexion_google
from .connexion import connexion_par_code
from .connexion import connexion_par_email
from .connexion import deconnexion
from .connexion import envoyer_code
from .connexion import mot_de_passe_oublie
from .connexion import nouveau_mot_de_passe
from .connexion import session_en_cours
from .connexion import utilisateurs_du_poste
from .connexion import verifier_application
from .connexion import verifier_code
from .groupes import GroupesViewSet
from .mfa import MfaViewSet
from .postes import PostesViewSet
from .utilisateurs import UtilisateursViewSet

router = SimpleRouter()
router.register("postes", PostesViewSet, basename="poste")
router.register("utilisateurs", UtilisateursViewSet, basename="utilisateur")
router.register("mfa", MfaViewSet, basename="mfa")
router.register("groupes", GroupesViewSet, basename="groupe")
router.register("brouillons", BrouillonsViewSet, basename="brouillon")

urlpatterns = [
    path(
        "connexion/utilisateurs/",
        utilisateurs_du_poste,
        name="connexion-utilisateurs",
    ),
    path("connexion/code/", connexion_par_code, name="connexion-code"),
    path("connexion/email/", connexion_par_email, name="connexion-email"),
    path("connexion/google/", connexion_google, name="connexion-google"),
    path("connexion/otp/envoyer/", envoyer_code, name="connexion-otp-envoyer"),
    path("connexion/otp/verifier/", verifier_code, name="connexion-otp-verifier"),
    path("connexion/totp/", verifier_application, name="connexion-totp"),
    path("connexion/annuler/", annuler_identification, name="connexion-annuler"),
    path("connexion/deconnexion/", deconnexion, name="connexion-deconnexion"),
    path(
        "connexion/changer-utilisateur/",
        changer_utilisateur,
        name="connexion-changer-utilisateur",
    ),
    path("connexion/session/", session_en_cours, name="connexion-session"),
    path("connexion/invitation/", accepter_invitation, name="connexion-invitation"),
    path(
        "connexion/mot-de-passe-oublie/",
        mot_de_passe_oublie,
        name="connexion-mot-de-passe-oublie",
    ),
    path(
        "connexion/nouveau-mot-de-passe/",
        nouveau_mot_de_passe,
        name="connexion-nouveau-mot-de-passe",
    ),
    *router.urls,
]
