from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ClientsConfig(AppConfig):
    name = "optiboul.clients"
    verbose_name = _("Clients et dettes")

    def ready(self) -> None:
        from .infrastructure import cloture  # noqa: PLC0415

        cloture.enregistrer()
