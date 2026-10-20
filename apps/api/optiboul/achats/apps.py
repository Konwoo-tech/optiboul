from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AchatsConfig(AppConfig):
    name = "optiboul.achats"
    verbose_name = _("Fournisseurs et réceptions")
