from rest_framework.routers import SimpleRouter

from .notifications import NotificationsViewSet
from .notifications import ReglesNotificationViewSet

router = SimpleRouter()
router.register("notifications", NotificationsViewSet, basename="notification")
router.register(
    "regles-notification",
    ReglesNotificationViewSet,
    basename="regle-notification",
)

urlpatterns = router.urls
