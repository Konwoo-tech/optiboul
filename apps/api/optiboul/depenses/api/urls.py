from rest_framework.routers import SimpleRouter

from .depenses import DepensesViewSet

router = SimpleRouter()
router.register("depenses", DepensesViewSet, basename="depense")

urlpatterns = router.urls
