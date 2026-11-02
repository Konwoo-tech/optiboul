import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db


def test_sorties_a_la_cloture_de_production(
    client_de,
    responsable_production,
    gerant,
    production,
    heure,
):
    with heure(23):
        for code, pains in [("BAG", 945), ("KO", 426)]:
            client_de(responsable_production).post(
                reverse("api:production-fournee", kwargs={"pk": production["id"]}),
                {"produit": code, "pains": pains},
                format="json",
            )
        client_de(responsable_production).put(
            reverse("api:production-consommation", kwargs={"pk": production["id"]}),
            {
                "quantites": {
                    "farine": "205",
                    "eau": "110",
                    "sel": "2400",
                    "levure": "1800",
                    "ameliorant": "1200",
                    "glace": "20",
                },
            },
            format="json",
        )
        client_de(responsable_production).post(
            reverse("api:production-cloturer", kwargs={"pk": production["id"]}),
        )
    mouvements = (
        client_de(gerant)
        .get(
            reverse("api:mouvement-stock-list"),
            {"source_type": "production", "source_id": production["id"]},
        )
        .json()
    )
    assert mouvements["count"] == 5
    farine = next(m for m in mouvements["results"] if m["matiere"] == "farine")
    assert (farine["sens"], farine["quantite"], farine["genre"]) == (
        -1,
        "205.000",
        "production",
    )
    assert farine["auteur"] == "Serge"
    quantites = (
        client_de(gerant).get(reverse("api:mouvement-stock-stock")).json()["quantites"]
    )
    assert quantites["farine"] == "-205.000"
    assert "eau" not in quantites
