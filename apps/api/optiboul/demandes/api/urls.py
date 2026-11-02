from rest_framework.routers import SimpleRouter

from .demandes import DemandesViewSet

router = SimpleRouter()
router.register("demandes", DemandesViewSet, basename="demande")

urlpatterns = router.urls
