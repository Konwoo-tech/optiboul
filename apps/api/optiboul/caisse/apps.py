from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CaisseConfig(AppConfig):
    name = "optiboul.caisse"
    verbose_name = _("Caisses")
