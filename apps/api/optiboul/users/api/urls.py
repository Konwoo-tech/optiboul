from django.urls import path
from rest_framework.routers import SimpleRouter

from .connexion import annuler_identification
from .connexion import connexion_par_code
from .connexion import connexion_par_email
from .connexion import deconnexion
from .connexion import envoyer_code
from .connexion import utilisateurs_du_poste
from .connexion import verifier_code
from .postes import PostesViewSet
from .utilisateurs import UtilisateursViewSet

router = SimpleRouter()
router.register("postes", PostesViewSet, basename="poste")
router.register("utilisateurs", UtilisateursViewSet, basename="utilisateur")

urlpatterns = [
    path(
        "connexion/utilisateurs/",
        utilisateurs_du_poste,
        name="connexion-utilisateurs",
    ),
    path("connexion/code/", connexion_par_code, name="connexion-code"),
    path("connexion/email/", connexion_par_email, name="connexion-email"),
    path("connexion/otp/envoyer/", envoyer_code, name="connexion-otp-envoyer"),
    path("connexion/otp/verifier/", verifier_code, name="connexion-otp-verifier"),
    path("connexion/annuler/", annuler_identification, name="connexion-annuler"),
    path("connexion/deconnexion/", deconnexion, name="connexion-deconnexion"),
    *router.urls,
]
