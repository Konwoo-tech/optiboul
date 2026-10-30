from rest_framework.routers import SimpleRouter

from .fournisseurs import FacturesViewSet
from .fournisseurs import FournisseursViewSet
from .fournisseurs import PaiementsFournisseursViewSet
from .fournisseurs import ReceptionsPlanifieesViewSet

router = SimpleRouter()
router.register("fournisseurs", FournisseursViewSet, basename="fournisseur")
router.register("factures", FacturesViewSet, basename="facture")
router.register(
    "paiements-fournisseurs",
    PaiementsFournisseursViewSet,
    basename="paiement-fournisseur",
)
router.register(
    "receptions-planifiees",
    ReceptionsPlanifieesViewSet,
    basename="reception-planifiee",
)

urlpatterns = router.urls
