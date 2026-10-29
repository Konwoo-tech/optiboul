from django.urls import path
from rest_framework.routers import SimpleRouter

from .journal import JournalViewSet
from .parametres import ParametresViewSet
from .sauvegardes import SauvegardesViewSet
from .views import sante

router = SimpleRouter()
router.register("journal", JournalViewSet, basename="journal")
router.register("parametres", ParametresViewSet, basename="parametre")
router.register("sauvegardes", SauvegardesViewSet, basename="sauvegarde")

urlpatterns = [
    path("sante/", sante, name="sante"),
    *router.urls,
]
