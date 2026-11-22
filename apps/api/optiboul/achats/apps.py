from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AchatsConfig(AppConfig):
    name = "optiboul.achats"
    verbose_name = _("Fournisseurs et réceptions")

    def ready(self) -> None:
        from .infrastructure import cloture  # noqa: PLC0415

        cloture.enregistrer()
