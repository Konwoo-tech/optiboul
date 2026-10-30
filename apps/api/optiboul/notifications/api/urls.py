from django.urls import path
from rest_framework.routers import SimpleRouter

from .envois import EnvoisViewSet
from .envois import etat_des_envois
from .notifications import NotificationsViewSet
from .notifications import ReglesNotificationViewSet

router = SimpleRouter()
router.register("notifications", NotificationsViewSet, basename="notification")
router.register("envois", EnvoisViewSet, basename="envoi")
router.register(
    "regles-notification",
    ReglesNotificationViewSet,
    basename="regle-notification",
)

urlpatterns = [
    path("envois/etat/", etat_des_envois, name="envois-etat"),
    *router.urls,
]
