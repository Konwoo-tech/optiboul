from django.urls import path

from .accueil import accueil
from .tableau_de_bord import tableau_de_bord

urlpatterns = [
    path("accueil/", accueil, name="accueil"),
    path("tableau-de-bord/", tableau_de_bord, name="tableau-de-bord"),
]
