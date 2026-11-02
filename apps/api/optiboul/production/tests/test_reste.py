import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

RESTE = reverse("api:production-reste-a-produire")


def _fournee(client, production, code, pains):
    return client.post(
        reverse("api:production-fournee", kwargs={"pk": production["id"]}),
        {"produit": code, "pains": pains},
        format="json",
    )


def test_reste_mis_a_jour_a_chaque_fournee(
    client_de,
    caissiere,
    gerant,
    responsable_production,
    production,
    heure,
):
    with heure(19, 30):
        avant = client_de(caissiere).get(RESTE)
        assert avant.status_code == 200, avant.content
        assert avant.json()["reste"] == 1_371
        assert avant.json()["mis_a_jour"] is None
        assert avant["Cache-Control"] == "no-store"
        _fournee(client_de(responsable_production), production, "BAG", 315)
    with heure(20, 10):
        _fournee(client_de(responsable_production), production, "BAG", 300)
        apres = client_de(gerant).get(RESTE).json()
    baguette = next(p for p in apres["produits"] if p["code"] == "BAG")
    assert (baguette["prevus"], baguette["realise"], baguette["reste"]) == (
        945,
        615,
        330,
    )
    assert apres["reste"] == 330 + 426
    assert apres["statut"] == "en_cours"
    assert [f["pains"] for f in apres["fournees"]] == [300, 315]
    assert apres["mis_a_jour"] == "2026-10-27T20:10:00+01:00"
    assert apres["rafraichir_secondes"] == 15
    # Seuls les produits au plan sont listés.
    assert {p["code"] for p in apres["produits"]} == {"BAG", "KO"}


def test_avant_l_ouverture_le_plan_suffit(client_de, caissiere, plan_valide, heure):
    with heure(18, 50):
        reste = client_de(caissiere).get(RESTE).json()
    assert reste["statut"] is None
    assert reste["reste"] == 1_371


def test_sans_plan_rien_a_produire(client_de, caissiere, s44, heure):
    with heure(18, 50):
        assert client_de(caissiere).get(RESTE).json()["produits"] == []
