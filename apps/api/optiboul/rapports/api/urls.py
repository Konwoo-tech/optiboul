from django.urls import path

from .accueil import accueil
from .alertes import alertes
from .exports import export_mois
from .exports import export_semaine
from .exports import export_session
from .tableau_de_bord import tableau_de_bord

urlpatterns = [
    path("accueil/", accueil, name="accueil"),
    path("alertes/", alertes, name="alertes"),
    path("rapports/session/", export_session, name="export-session"),
    path("rapports/semaine/", export_semaine, name="export-semaine"),
    path("rapports/mois/", export_mois, name="export-mois"),
    path("tableau-de-bord/", tableau_de_bord, name="tableau-de-bord"),
]
