from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class VentesConfig(AppConfig):
    name = "optiboul.ventes"
    verbose_name = _("Ventes")

    def ready(self) -> None:
        from .infrastructure import autorisations  # noqa: PLC0415

        autorisations.enregistrer()
