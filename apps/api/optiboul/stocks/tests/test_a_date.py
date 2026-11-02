from datetime import date
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse

from optiboul.stocks.domain.stocks import ventiler
from optiboul.stocks.infrastructure.models import ControleStock
from optiboul.stocks.infrastructure.models import LigneControle
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.models import MouvementStock

A_DATE = reverse("api:mouvement-stock-stock-a-date")
YAOUNDE = ZoneInfo("Africa/Douala")


def test_ventilation():
    du_jour = ventiler(
        [
            ("reception", 1, Decimal(100)),
            ("production", -1, Decimal(30)),
            ("perte", -1, Decimal(5)),
            ("inventaire", -1, Decimal(2)),
            ("correction", 1, Decimal(1)),
        ],
    )
    assert (du_jour.entrees, du_jour.sorties, du_jour.ajustements) == (
        Decimal(100),
        Decimal(35),
        Decimal(-1),
    )


pytestmark = pytest.mark.django_db


def _mouvement(semaine, auteur, le, genre, sens, quantite):
    MouvementStock.objects.create(
        matiere=Matiere.objects.get(code="farine"),
        sens=sens,
        quantite=Decimal(quantite),
        genre=genre,
        source_type="essai",
        source_id=1,
        semaine=semaine,
        auteur=auteur,
        cree_le=le,
    )


@pytest.fixture
def historique(s44, gerant):
    lundi = datetime(2026, 10, 26, 22, 0, tzinfo=YAOUNDE)
    mardi = datetime(2026, 10, 27, 23, 59, tzinfo=YAOUNDE)
    mercredi = datetime(2026, 10, 28, 0, 1, tzinfo=YAOUNDE)
    _mouvement(s44, gerant, lundi, "reception", 1, 500)
    _mouvement(s44, gerant, mardi, "production", -1, 200)
    _mouvement(s44, gerant, mercredi, "production", -1, 100)


def _farine(client, jour):
    lignes = client.get(A_DATE, {"date": jour}).json()
    return next(ligne for ligne in lignes if ligne["matiere"] == "farine")


def test_stock_du_soir(client_de, gerant, historique):
    client = client_de(gerant)
    mardi = _farine(client, "2026-10-27")
    assert Decimal(mardi["stock"]) == 300
    assert (Decimal(mardi["entrees"]), Decimal(mardi["sorties"])) == (0, 200)
    assert Decimal(_farine(client, "2026-10-26")["stock"]) == 500
    assert Decimal(_farine(client, "2026-10-28")["stock"]) == 200
    assert Decimal(_farine(client, "2026-10-01")["stock"]) == 0


def test_dernier_comptage(client_de, gerant, s44, historique):
    controle = ControleStock.objects.create(
        semaine=s44,
        jour=date(2026, 10, 28),
        portee="cles",
    )
    LigneControle.objects.create(
        controle=controle,
        matiere=Matiere.objects.get(code="farine"),
        theorique=Decimal(200),
        compte=Decimal(198),
        statut="ajustee",
    )
    client = client_de(gerant)
    assert _farine(client, "2026-10-27")["dernier_comptage"] is None
    comptage = _farine(client, "2026-10-29")["dernier_comptage"]
    assert comptage["jour"] == "2026-10-28"
    assert Decimal(comptage["quantite"]) == 198


def test_date_obligatoire(client_de, gerant):
    assert client_de(gerant).get(A_DATE).status_code == 400
