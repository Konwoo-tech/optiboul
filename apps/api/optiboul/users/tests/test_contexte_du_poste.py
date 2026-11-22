"""Sur un poste de confiance, la connexion montre semaine et session (#307)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.users.postes import COOKIE
from optiboul.users.tests.factories import poste_de_confiance

ACTUEL = reverse("api:poste-actuel")

pytestmark = pytest.mark.django_db


def _poste() -> APIClient:
    client = APIClient()
    client.cookies[COOKIE] = poste_de_confiance()
    return client


def test_semaine_et_session_sur_le_poste(
    s44,
    gerant,
    responsable_production,
    caisse_ouverte,
):
    corps = _poste().get(ACTUEL).json()
    assert corps["poste"]["nom"] == "Comptoir"
    semaine = corps["contexte"]["semaine"]
    assert (semaine["numero"], semaine["du"], semaine["au"]) == (
        44,
        "2026-10-26",
        "2026-11-01",
    )
    assert (semaine["gerant"], semaine["production"]) == ("Willy", "Serge")
    session = corps["contexte"]["session"]
    assert (session["creneau"], session["caissiere"]) == (
        caisse_ouverte.creneau,
        "Rachel",
    )


def test_rien_hors_du_poste(s44, caisse_ouverte):
    assert APIClient().get(ACTUEL).json() == {"poste": None, "contexte": None}


def test_rien_depuis_le_tunnel(s44):
    client = _poste()
    corps = client.get(ACTUEL, HTTP_X_OPTIBOUL_ENTREE="distante").json()
    assert corps == {"poste": None, "contexte": None}


def test_ni_semaine_ni_session(db):
    assert _poste().get(ACTUEL).json()["contexte"] == {"semaine": None, "session": None}
