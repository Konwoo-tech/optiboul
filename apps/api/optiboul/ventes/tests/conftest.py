import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import TarifClient
from optiboul.production.infrastructure.models import Produit


@pytest.fixture
def rachel_boutique(db) -> Client:
    """Client livreur : la baguette à 95 FCFA, le reste au prix de base."""
    client = Client.objects.create(nom="Rachel Boutique", type="livreur")
    TarifClient.objects.create(
        client=client,
        produit=Produit.objects.get(code="BAG"),
        prix=95,
    )
    return client


@pytest.fixture
def mama(db) -> Client:
    return Client.objects.create(nom="Mama Rasta")


@pytest.fixture
def caisse(client_de, caissiere, planning_rachel, horloge) -> Caisse:
    """La caisse de jour du mardi, ouverte par Rachel avec 20 000 FCFA de fonds."""
    reponse = client_de(caissiere).post(reverse("api:caisse-ouvrir"), {"fonds": 20_000})
    return Caisse.objects.get(pk=reponse.json()["id"])
