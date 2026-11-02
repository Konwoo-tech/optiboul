from rest_framework.routers import SimpleRouter

from .controles import ControlesStockViewSet
from .matieres import MatieresViewSet
from .mouvements import MouvementsStockViewSet

router = SimpleRouter()
router.register("controles-stock", ControlesStockViewSet, basename="controle-stock")
router.register("matieres", MatieresViewSet, basename="matiere")
router.register(
    "mouvements-stock",
    MouvementsStockViewSet,
    basename="mouvement-stock",
)

urlpatterns = router.urls
