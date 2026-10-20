from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import sante

router = SimpleRouter()

urlpatterns = [
    path("sante/", sante, name="sante"),
    *router.urls,
]
