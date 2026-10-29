from rest_framework.routers import SimpleRouter

from .postes import PostesViewSet

router = SimpleRouter()
router.register("postes", PostesViewSet, basename="poste")

urlpatterns = router.urls
