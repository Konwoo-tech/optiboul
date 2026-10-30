from rest_framework.routers import SimpleRouter

from .fournisseurs import FournisseursViewSet
from .fournisseurs import ReceptionsPlanifieesViewSet

router = SimpleRouter()
router.register("fournisseurs", FournisseursViewSet, basename="fournisseur")
router.register(
    "receptions-planifiees",
    ReceptionsPlanifieesViewSet,
    basename="reception-planifiee",
)

urlpatterns = router.urls
