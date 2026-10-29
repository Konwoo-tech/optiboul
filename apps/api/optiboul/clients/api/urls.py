from rest_framework.routers import SimpleRouter

from .clients import ClientsViewSet

router = SimpleRouter()
router.register("clients", ClientsViewSet, basename="client")

urlpatterns = router.urls
