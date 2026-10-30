from rest_framework.routers import SimpleRouter

from .matieres import MatieresViewSet
from .mouvements import MouvementsStockViewSet

router = SimpleRouter()
router.register("matieres", MatieresViewSet, basename="matiere")
router.register(
    "mouvements-stock",
    MouvementsStockViewSet,
    basename="mouvement-stock",
)

urlpatterns = router.urls
