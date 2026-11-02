import pytest
from django.urls import reverse

from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.clients import prix_du_client
from optiboul.clients.domain.clients import telephone_du_client
from optiboul.clients.infrastructure.models import Client
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal


def test_telephone_du_client():
    assert telephone_du_client("+237 6 77 41 20 18") == "677412018"
    assert telephone_du_client("  ") == ""
    with pytest.raises(RefusMetier) as refus:
        telephone_du_client("12345")
    assert refus.value.code == "telephone_invalide"


def test_plafond_et_prix_du_client():
    assert plafond_du_client(None, 2_000) == 2_000
    assert plafond_du_client(0, 2_000) == 0
    assert prix_du_client(95, 100) == 95
    assert prix_du_client(None, 100) == 100
    assert prix_du_client(None, None) is None


@pytest.fixture
def clients(db) -> list[Client]:
    return [
        Client.objects.create(
            nom="Rachel Boutique",
            type="livreur",
            telephone="677412018",
        ),
        Client.objects.create(nom="Mama Rasta", type="particulier"),
        Client.objects.create(nom="Hôtel Ibrahim", type="hotel", plafond=10_000),
        Client.objects.create(nom="Raoul", type="restaurant", actif=False),
    ]


@pytest.mark.django_db
class TestApi:
    def test_creation_par_le_gerant(self, client_de, gerant, caissiere):
        url = reverse("api:client-list")
        corps = {
            "nom": " Boulangerie Etoudi ",
            "type": "restaurant",
            "telephone": "+237 6 99 00 11 22",
            "plafond": 5_000,
        }
        assert client_de(caissiere).post(url, corps, format="json").status_code == 403
        reponse = client_de(gerant).post(url, corps, format="json")
        assert reponse.status_code == 201, reponse.content
        cree = reponse.json()
        assert cree["nom"] == "Boulangerie Etoudi"
        assert cree["telephone"] == "699001122"
        assert cree["plafond_effectif"] == 5_000
        assert cree["prix"]["BAG"] == 100
        trace = LigneJournal.objects.get(action="client.cree")
        assert trace.apres is not None
        assert trace.apres["telephone"] == "699001122"

    def test_telephone_invalide(self, client_de, proprietaire):
        reponse = client_de(proprietaire).post(
            reverse("api:client-list"),
            {"nom": "X", "telephone": "12"},
            format="json",
        )
        assert reponse.status_code == 400
        assert "telephone" in reponse.json()

    def test_recherche_par_les_premieres_lettres(self, client_de, caissiere, clients):
        url = reverse("api:client-list")
        reponse = client_de(caissiere).get(url, {"recherche": "ra", "actif": "true"})
        noms = [c["nom"] for c in reponse.json()["results"]]
        # Début du nom d'abord, puis début d'un autre mot ; « Ibrahim » n'en est pas.
        assert noms == ["Rachel Boutique", "Mama Rasta"]
        reponse = client_de(caissiere).get(url, {"recherche": "ra"})
        assert [c["nom"] for c in reponse.json()["results"]] == [
            "Rachel Boutique",
            "Raoul",
            "Mama Rasta",
        ]

    def test_telephone_masque_pour_la_caisse(
        self,
        client_de,
        caissiere,
        gerant,
        clients,
    ):
        detail = reverse("api:client-detail", kwargs={"pk": clients[0].pk})
        assert (
            client_de(caissiere).get(detail).json()["telephone"] == "+237 6 •• •• 20 18"
        )
        assert client_de(gerant).get(detail).json()["telephone"] == "677412018"

    def test_plafond_propre_ou_general(self, client_de, gerant, clients):
        url = reverse("api:client-list")
        par_nom = {
            c["nom"]: c["plafond_effectif"]
            for c in client_de(gerant).get(url).json()["results"]
        }
        assert par_nom["Hôtel Ibrahim"] == 10_000
        assert par_nom["Mama Rasta"] == 2_000

    def test_tarif_par_produit(self, client_de, gerant, caissiere, clients):
        rachel = clients[0]
        url = reverse("api:client-tarifs", kwargs={"pk": rachel.pk})
        corps = {"tarifs": {"BAG": 95, "KO": 65}}
        assert client_de(caissiere).put(url, corps, format="json").status_code == 403
        reponse = client_de(gerant).put(url, corps, format="json")
        assert reponse.status_code == 200, reponse.content
        assert reponse.json()["tarifs"] == {"BAG": 95, "KO": 65}
        assert reponse.json()["prix"]["BAG"] == 95
        assert reponse.json()["prix"]["GC135"] == 160
        assert reponse.json()["prix"]["PSL"] is None
        reponse = client_de(gerant).put(url, {"tarifs": {"KO": None}}, format="json")
        assert reponse.json()["tarifs"] == {"BAG": 95}
        assert reponse.json()["prix"]["KO"] == 70
        traces = LigneJournal.objects.filter(action="client.tarifs").order_by("id")
        assert [(t.avant, t.apres) for t in traces] == [
            ({}, {"BAG": 95, "KO": 65}),
            ({"BAG": 95, "KO": 65}, {"BAG": 95}),
        ]

    def test_produit_inconnu(self, client_de, gerant, clients):
        url = reverse("api:client-tarifs", kwargs={"pk": clients[0].pk})
        reponse = client_de(gerant).put(url, {"tarifs": {"XXL": 10}}, format="json")
        assert reponse.status_code == 400
        assert reponse.json()["produits"] == ["XXL"]

    def test_modification_tracee(self, client_de, proprietaire, clients):
        detail = reverse("api:client-detail", kwargs={"pk": clients[1].pk})
        reponse = client_de(proprietaire).patch(
            detail,
            {"plafond": 3_000},
            format="json",
        )
        assert reponse.json()["plafond_effectif"] == 3_000
        trace = LigneJournal.objects.get(action="client.modifie")
        assert (trace.avant or {})["plafond"] is None
        assert (trace.apres or {})["plafond"] == 3_000
