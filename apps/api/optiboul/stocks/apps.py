from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class StocksConfig(AppConfig):
    name = "optiboul.stocks"
    verbose_name = _("Stocks")

    def ready(self) -> None:
        from .infrastructure import controles  # noqa: PLC0415
        from .infrastructure import passation  # noqa: PLC0415

        controles.enregistrer()
        passation.enregistrer()
