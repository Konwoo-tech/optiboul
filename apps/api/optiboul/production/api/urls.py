from rest_framework.routers import SimpleRouter

from .produits import ProduitsViewSet

router = SimpleRouter()
router.register("produits", ProduitsViewSet, basename="produit")

urlpatterns = router.urls
