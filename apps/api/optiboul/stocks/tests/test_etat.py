from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.production.infrastructure.models import Consommation
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.models import Production
from optiboul.stocks.domain.etat import StatutStock
from optiboul.stocks.domain.etat import sessions_restantes
from optiboul.stocks.domain.etat import statut_stock
from optiboul.stocks.domain.etat import valeur_stock
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock

ETAT = reverse("api:mouvement-stock-etat")


def test_sessions_restantes():
    assert sessions_restantes(Decimal(500), Decimal(200)) == Decimal("2.5")
    assert sessions_restantes(Decimal(-5), Decimal(200)) == Decimal(0)
    assert sessions_restantes(Decimal(500), Decimal(0)) is None


@pytest.mark.parametrize(
    ("quantite", "sessions", "attendu"),
    [
        (Decimal(1000), Decimal(8), StatutStock.SUFFISANT),
        (Decimal(1000), Decimal(6), StatutStock.SUFFISANT),
        (Decimal(1000), Decimal("5.9"), StatutStock.A_COMMANDER),
        (Decimal(1000), Decimal("1.9"), StatutStock.STOCK_BAS),
        (Decimal(0), None, StatutStock.STOCK_BAS),
        (Decimal(10), None, StatutStock.SUFFISANT),
    ],
)
def test_statut(quantite, sessions, attendu):
    assert statut_stock(quantite, sessions, bas=2, a_commander=6) is attendu


def test_valeur_en_entier():
    assert valeur_stock(Decimal(50), Decimal("390.5")) == 19525


pytestmark = pytest.mark.django_db


@pytest.fixture
def consommation(s44, gerant, responsable_production):
    stock.mouvementer(
        {"farine": Decimal(500)},
        sens=Sens.ENTREE,
        genre=GenreMouvementStock.RECEPTION,
        source_type="essai",
        source_id=1,
        semaine=s44.pk,
        auteur=gerant.pk,
    )
    plan = PlanProduction.objects.create(
        semaine=s44,
        jour=date(2026, 10, 27),
        creneau="jour",
        propose_par=responsable_production,
    )
    production = Production.objects.create(
        plan=plan,
        semaine=s44,
        statut="cloturee",
        ouverte_par=responsable_production,
    )
    Consommation.objects.create(
        production=production,
        matiere=Matiere.objects.get(code="farine"),
        quantite=Decimal(200),
        saisie_par=responsable_production,
    )


def test_etat_du_stock(client_de, gerant, minoterie_planifiee, consommation):
    lignes = client_de(gerant).get(ETAT).json()
    farine = next(ligne for ligne in lignes if ligne["matiere"] == "farine")
    assert Decimal(farine["quantite"]) == 500
    assert Decimal(farine["besoin_par_session"]) == 200
    assert Decimal(farine["sessions_restantes"]) == Decimal("2.5")
    assert farine["statut"] == "a_commander"
    assert farine["prochaine_reception"] == "2026-11-02"
    assert farine["valeur"] == 195250
    levure = next(ligne for ligne in lignes if ligne["matiere"] == "levure")
    assert levure["statut"] == "stock_bas"


def test_caissiere_refusee(client_de, caissiere):
    assert client_de(caissiere).get(ETAT).status_code == 403


@pytest.fixture
def minoterie_planifiee(db, gerant):
    from optiboul.achats.infrastructure.models import Fournisseur  # noqa: PLC0415

    fournisseur = Fournisseur.objects.create(nom="Minoterie du Centre")
    ReceptionPlanifiee.objects.create(
        fournisseur=fournisseur,
        matiere=Matiere.objects.get(code="farine"),
        quantite=Decimal(500),
        prevue_le=date(2026, 11, 2),
        planifiee_par=gerant,
    )
