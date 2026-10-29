from django.urls import path
from rest_framework.routers import SimpleRouter

from .connexion import connexion_par_code
from .connexion import utilisateurs_du_poste
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
    *router.urls,
]
