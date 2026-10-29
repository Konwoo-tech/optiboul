from rest_framework.routers import SimpleRouter

from .commandes import CommandesViewSet

router = SimpleRouter()
router.register("commandes", CommandesViewSet, basename="commande")

urlpatterns = router.urls
