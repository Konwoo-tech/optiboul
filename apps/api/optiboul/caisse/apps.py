from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CaisseConfig(AppConfig):
    name = "optiboul.caisse"
    verbose_name = _("Caisses")

    def ready(self) -> None:
        from .infrastructure import cloture  # noqa: PLC0415
        from .infrastructure import passation  # noqa: PLC0415

        cloture.enregistrer()
        passation.enregistrer()
