from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class DepensesConfig(AppConfig):
    name = "optiboul.depenses"
    verbose_name = _("Dépenses et budget")
