from rest_framework.routers import SimpleRouter

from .paies import EmployesViewSet
from .paies import PaiesViewSet

router = SimpleRouter()
router.register("employes", EmployesViewSet, basename="employe")
router.register("paies", PaiesViewSet, basename="paie")

urlpatterns = router.urls
