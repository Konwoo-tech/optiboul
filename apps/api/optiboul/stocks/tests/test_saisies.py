from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.infrastructure.models import MouvementStock
from optiboul.stocks.infrastructure.stocks import stock

SAISIR = reverse("api:mouvement-stock-saisir")

pytestmark = pytest.mark.django_db


@pytest.fixture
def farine_en_stock(s44, gerant):
    stock.mouvementer(
        {"farine": Decimal(500)},
        sens=Sens.ENTREE,
        genre=GenreMouvementStock.RECEPTION,
        source_type="essai",
        source_id=1,
        semaine=s44.pk,
        auteur=gerant.pk,
    )


def _saisir(client, cle="c1", **corps):
    donnees = {
        "matiere": "farine",
        "quantite": "10",
        "genre": "perte",
        "motif": "Sac déchiré",
    } | corps
    return client.post(SAISIR, donnees, format="json", HTTP_IDEMPOTENCY_KEY=cle)


def test_perte_motivee(client_de, gerant, farine_en_stock):
    reponse = _saisir(client_de(gerant))
    assert reponse.status_code == 201
    assert stock.quantites()["farine"] == Decimal(490)
    mouvement = MouvementStock.objects.get(genre="perte")
    assert (mouvement.sens, mouvement.motif) == (-1, "Sac déchiré")
    assert LigneJournal.objects.filter(action="stock.perte").exists()


def test_rejeu_sans_doublon(client_de, gerant, farine_en_stock):
    client = client_de(gerant)
    _saisir(client)
    _saisir(client)
    assert stock.quantites()["farine"] == Decimal(490)


def test_correction_dans_les_deux_sens(
    client_de,
    responsable_production,
    farine_en_stock,
):
    client = client_de(responsable_production)
    assert _saisir(client, genre="correction", sens=1).status_code == 201
    retrait = _saisir(client, "c2", genre="correction", sens=-1, quantite="4")
    assert retrait.status_code == 201
    assert stock.quantites()["farine"] == Decimal(506)


@pytest.mark.parametrize(
    ("corps", "code", "statut"),
    [
        ({"motif": "  "}, "motif_obligatoire", 400),
        ({"sens": 1}, "sens_invalide", 400),
        ({"quantite": "0"}, "quantite_invalide", 400),
        ({"matiere": "eau"}, "matiere_inconnue", 400),
        ({"quantite": "501"}, "stock_insuffisant", 409),
    ],
)
def test_refus(client_de, gerant, farine_en_stock, corps, code, statut):
    reponse = _saisir(client_de(gerant), **corps)
    assert (reponse.status_code, reponse.json()["code"]) == (statut, code)


def test_caissiere_refusee(client_de, caissiere, farine_en_stock):
    assert _saisir(client_de(caissiere)).status_code == 403


def test_proprietaire_ne_saisit_pas(client_de, proprietaire, farine_en_stock):
    assert _saisir(client_de(proprietaire)).status_code == 403
