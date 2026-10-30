from django.urls import path

from .accueil import accueil

urlpatterns = [
    path("accueil/", accueil, name="accueil"),
]
