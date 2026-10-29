from rest_framework.routers import SimpleRouter

from .commandes import CommandesViewSet
from .livraisons import LivraisonsViewSet

router = SimpleRouter()
router.register("commandes", CommandesViewSet, basename="commande")
router.register("livraisons", LivraisonsViewSet, basename="livraison")

urlpatterns = router.urls
