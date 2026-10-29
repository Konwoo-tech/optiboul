from django.conf import settings
from django.urls import include
from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework.routers import SimpleRouter

from optiboul.users.api.views import UserViewSet

router = DefaultRouter() if settings.DEBUG else SimpleRouter()

router.register("users", UserViewSet)

# Applications par domaine (spécification technique §3.3) : chacune expose ses routes
# dans `optiboul/<domaine>/api/urls.py`.
DOMAINES = [
    "core",
    "caisse",
    "ventes",
    "clients",
    "production",
    "stocks",
    "achats",
    "depenses",
    "demandes",
    "paie",
    "rapports",
    "notifications",
]

app_name = "api"
urlpatterns = [
    *router.urls,
    path("", include("optiboul.users.api.urls")),
    *(path("", include(f"optiboul.{domaine}.api.urls")) for domaine in DOMAINES),
]
