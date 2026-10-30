from rest_framework.routers import SimpleRouter

from .budgets import BudgetsViewSet
from .depenses import DepensesViewSet
from .depenses import PreAutorisationsViewSet

router = SimpleRouter()
router.register("depenses", DepensesViewSet, basename="depense")
router.register("budgets", BudgetsViewSet, basename="budget")
router.register(
    "pre-autorisations",
    PreAutorisationsViewSet,
    basename="pre-autorisation",
)

urlpatterns = router.urls
