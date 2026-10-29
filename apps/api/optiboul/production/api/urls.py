from rest_framework.routers import SimpleRouter

from .plans import ProductionsViewSet
from .produits import ProduitsViewSet

router = SimpleRouter()
router.register("produits", ProduitsViewSet, basename="produit")
router.register("productions", ProductionsViewSet, basename="production")

urlpatterns = router.urls
