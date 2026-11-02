from rest_framework.routers import SimpleRouter

from .caisses import CaissesViewSet

router = SimpleRouter()
router.register("caisses", CaissesViewSet, basename="caisse")

urlpatterns = router.urls
