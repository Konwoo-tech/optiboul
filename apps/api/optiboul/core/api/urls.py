from django.urls import path
from rest_framework.routers import SimpleRouter

from .journal import JournalViewSet
from .views import sante

router = SimpleRouter()
router.register("journal", JournalViewSet, basename="journal")

urlpatterns = [
    path("sante/", sante, name="sante"),
    *router.urls,
]
