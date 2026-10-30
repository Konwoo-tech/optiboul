from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class PaieConfig(AppConfig):
    name = "optiboul.paie"
    verbose_name = _("Personnel et paie")

    def ready(self) -> None:
        from .infrastructure import paies  # noqa: PLC0415

        paies.enregistrer()
