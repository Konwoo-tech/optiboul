from rest_framework.routers import SimpleRouter

from .commandes import CommandesViewSet
from .encaissements import EncaissementsViewSet
from .livraisons import LivraisonsViewSet

router = SimpleRouter()
router.register("commandes", CommandesViewSet, basename="commande")
router.register("livraisons", LivraisonsViewSet, basename="livraison")
router.register("encaissements", EncaissementsViewSet, basename="encaissement")

urlpatterns = router.urls
