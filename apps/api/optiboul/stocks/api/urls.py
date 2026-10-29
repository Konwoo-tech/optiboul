from rest_framework.routers import SimpleRouter

from .matieres import MatieresViewSet

router = SimpleRouter()
router.register("matieres", MatieresViewSet, basename="matiere")

urlpatterns = router.urls
