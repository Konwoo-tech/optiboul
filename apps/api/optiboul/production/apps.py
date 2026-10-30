from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ProductionConfig(AppConfig):
    name = "optiboul.production"
    verbose_name = _("Production")

    def ready(self) -> None:
        from .infrastructure import cloture  # noqa: PLC0415
        from .infrastructure import supplements  # noqa: PLC0415

        cloture.enregistrer()
        supplements.enregistrer()
