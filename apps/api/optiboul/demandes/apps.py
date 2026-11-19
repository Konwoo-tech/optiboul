from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class DemandesConfig(AppConfig):
    name = "optiboul.demandes"
    verbose_name = _("Demandes de validation")

    def ready(self) -> None:
        from .infrastructure import cloture  # noqa: PLC0415

        cloture.enregistrer()
