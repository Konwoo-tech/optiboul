from django.urls import path

from .accueil import accueil
from .alertes import alertes
from .tableau_de_bord import tableau_de_bord

urlpatterns = [
    path("accueil/", accueil, name="accueil"),
    path("alertes/", alertes, name="alertes"),
    path("tableau-de-bord/", tableau_de_bord, name="tableau-de-bord"),
]
