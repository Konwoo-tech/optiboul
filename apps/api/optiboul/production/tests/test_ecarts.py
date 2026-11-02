from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.production import ecarts_a_justifier


def _ecarts(reelle):
    return ecarts_a_justifier(
        theorique={"farine": Decimal(200), "levure": Decimal(1000)},
        reelle=reelle,
        unites={"farine": "kg", "levure": "g"},
        sacs=4,
        kg_par_sac=2,
        pourcent=4,
    )


def test_seuils_r10():
    assert _ecarts({"farine": Decimal(208), "levure": Decimal(1040)}) == []
    assert _ecarts({"farine": Decimal("208.1"), "levure": Decimal(1041)}) == [
        "farine",
        "levure",
    ]
    assert _ecarts({"farine": Decimal(191)}) == ["farine"]


pytestmark = pytest.mark.django_db


def _saisir(client, production, **corps):
    return client.put(
        reverse("api:production-consommation", kwargs={"pk": production["id"]}),
        corps,
        format="json",
    )


def test_ecart_sans_justification_refuse(
    client_de,
    responsable_production,
    production,
    heure,
):
    with heure(22):
        reponse = _saisir(
            client_de(responsable_production),
            production,
            quantites={"farine": "230"},
        )
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "justification_obligatoire"
    assert reponse.json()["matieres"] == ["farine"]


def test_ecart_justifie_informe_le_gerant(
    client_de,
    responsable_production,
    gerant,
    production,
    heure,
):
    with heure(22):
        reponse = _saisir(
            client_de(responsable_production),
            production,
            quantites={"farine": "230"},
            justifications={"farine": "Sac percé"},
        )
    assert reponse.status_code == 200, reponse.content
    ligne = next(c for c in reponse.json()["consommation"] if c["matiere"] == "farine")
    assert ligne["justification"] == "Sac percé"
    notification = Notification.objects.get(genre="production.ecart_matiere")
    assert notification.destinataire == gerant
    assert "Sac percé" in notification.message


def test_sans_ecart_rien_a_justifier(
    client_de,
    responsable_production,
    production,
    heure,
):
    with heure(22):
        reponse = _saisir(
            client_de(responsable_production),
            production,
            quantites={"farine": "205"},
        )
    assert reponse.status_code == 200
    assert not Notification.objects.filter(genre="production.ecart_matiere").exists()
