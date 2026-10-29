from rest_framework.routers import SimpleRouter

from .postes import PostesViewSet
from .utilisateurs import UtilisateursViewSet

router = SimpleRouter()
router.register("postes", PostesViewSet, basename="poste")
router.register("utilisateurs", UtilisateursViewSet, basename="utilisateur")

urlpatterns = router.urls
