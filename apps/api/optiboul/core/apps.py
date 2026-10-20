from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CoreConfig(AppConfig):
    name = "optiboul.core"
    verbose_name = _("Semaines, planning et paramètres")
