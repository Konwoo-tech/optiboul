from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class RapportsConfig(AppConfig):
    name = "optiboul.rapports"
    verbose_name = _("Tableau de bord et rapports")
