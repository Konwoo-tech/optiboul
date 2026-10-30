from rest_framework.routers import SimpleRouter

from .fournisseurs import FacturesViewSet
from .fournisseurs import FournisseursViewSet
from .fournisseurs import PaiementsFournisseursViewSet
from .fournisseurs import ReceptionsPlanifieesViewSet
from .manquants import ManquantsViewSet

router = SimpleRouter()
router.register("fournisseurs", FournisseursViewSet, basename="fournisseur")
router.register("factures", FacturesViewSet, basename="facture")
router.register("manquants", ManquantsViewSet, basename="manquant")
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
