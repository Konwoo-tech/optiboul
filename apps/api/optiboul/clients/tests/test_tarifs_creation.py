"""Les tarifs s'appliquent dès la création du client (#309)."""

import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import Client
from optiboul.core.infrastructure.models import LigneJournal

CLIENTS = reverse("api:client-list")
ALAIN = {"nom": "Alain", "type": "livreur", "telephone": "677211045"}

pytestmark = pytest.mark.django_db


def test_creation_avec_tarifs(client_de, gerant):
    reponse = client_de(gerant).post(
        CLIENTS,
        {**ALAIN, "tarifs": {"BAG": 110, "KO": 75}},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    corps = reponse.json()
    assert corps["tarifs"] == {"BAG": 110, "KO": 75}
    assert (corps["prix"]["BAG"], corps["prix"]["KO"]) == (110, 75)
    trace = LigneJournal.objects.get(action="client.cree")
    assert (trace.apres or {}).get("tarifs") == {"BAG": 110, "KO": 75}


def test_produit_inconnu_ne_cree_rien(client_de, gerant):
    reponse = client_de(gerant).post(
        CLIENTS,
        {**ALAIN, "tarifs": {"BAG": 110, "GC": 90}},
        format="json",
    )
    assert (reponse.status_code, reponse.json()["code"]) == (400, "produit_inconnu")
    assert reponse.json()["produits"] == ["GC"]
    assert not Client.objects.exists()


def test_prix_negatif_refuse(client_de, gerant):
    reponse = client_de(gerant).post(
        CLIENTS,
        {**ALAIN, "tarifs": {"BAG": -5}},
        format="json",
    )
    assert reponse.status_code == 400


def test_modification_et_retrait(client_de, gerant):
    client = client_de(gerant)
    cree = client.post(CLIENTS, {**ALAIN, "tarifs": {"BAG": 110}}, format="json").json()
    url = reverse("api:client-detail", kwargs={"pk": cree["id"]})
    reponse = client.patch(url, {"tarifs": {"BAG": None, "KO": 80}}, format="json")
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["tarifs"] == {"KO": 80}
    sans = client.patch(url, {"lieu": "Etoudi"}, format="json").json()
    assert (sans["lieu"], sans["tarifs"]) == ("Etoudi", {"KO": 80})
