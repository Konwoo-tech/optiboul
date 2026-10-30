from datetime import date
from datetime import datetime
from decimal import Decimal
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.notifications.infrastructure.models import Notification
from optiboul.stocks.domain.controles import PorteeControle
from optiboul.stocks.domain.controles import a_soumettre
from optiboul.stocks.domain.controles import date_du_jour
from optiboul.stocks.domain.controles import portee_du_jour
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.infrastructure.models import ControleStock
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.models import MouvementStock
from optiboul.stocks.infrastructure.stocks import stock
from optiboul.stocks.infrastructure.tasks import marquer_controles_manques
from optiboul.stocks.infrastructure.tasks import planifier_controles
from optiboul.stocks.infrastructure.tasks import rappel_controle

MERCREDI = date(2026, 10, 28)
YAOUNDE = ZoneInfo("Africa/Douala")


def test_portee_et_date():
    assert portee_du_jour("mercredi") is PorteeControle.CLES
    assert portee_du_jour("dimanche") is PorteeControle.TOUTES
    assert date_du_jour(2026, 44, "mercredi") == MERCREDI


@pytest.mark.parametrize(
    ("theorique", "compte", "attendu"),
    [(100, 95, False), (100, 94, True), (0, 0, False), (0, 1, True)],
)
def test_tolerance(theorique, compte, attendu):
    assert a_soumettre(Decimal(theorique), Decimal(compte), 5) is attendu


pytestmark = pytest.mark.django_db


@pytest.fixture
def le_mercredi():
    moment = datetime(2026, 10, 28, 14, 0, tzinfo=YAOUNDE)
    with mock.patch("django.utils.timezone.now", return_value=moment):
        yield


@pytest.fixture
def controle(s44, gerant, le_mercredi):
    Matiere.objects.update(cle=False)
    Matiere.objects.filter(code__in=["farine", "levure"]).update(cle=True)
    for code in ("farine", "levure"):
        stock.mouvementer(
            {code: Decimal(100)},
            sens=Sens.ENTREE,
            genre=GenreMouvementStock.RECEPTION,
            source_type="essai",
            source_id=1,
            semaine=s44.pk,
            auteur=gerant.pk,
        )
    planifier_controles()
    return ControleStock.objects.get(jour=MERCREDI)


def _url(nom, controle):
    return reverse(f"api:controle-stock-{nom}", kwargs={"pk": controle.pk})


def _valider(client, controle, **comptes):
    return client.post(_url("valider", controle), {"comptes": comptes}, format="json")


def test_planifies_une_seule_fois(controle):
    planifier_controles()
    assert ControleStock.objects.count() == 2
    dimanche = ControleStock.objects.exclude(pk=controle.pk).get()
    assert (controle.portee, dimanche.portee) == ("cles", "toutes")


def test_liste_a_l_aveugle(client_de, gerant, controle):
    client = client_de(gerant)
    reponse = client.post(_url("commencer", controle))
    assert reponse.status_code == 200
    assert {m["code"] for m in reponse.json()} == {"farine", "levure"}
    assert "theorique" not in reponse.json()[0]
    controle.refresh_from_db()
    assert controle.statut == "a_faire"
    liste = client.get(reverse("api:controle-stock-list")).json()["results"]
    assert all(item["lignes"] == [] for item in liste)


def test_petit_ecart_ajuste_tout_de_suite(client_de, gerant, controle):
    reponse = _valider(client_de(gerant), controle, farine="97", levure="100")
    assert reponse.json() == {"demande": None}
    assert stock.quantites()["farine"] == Decimal(97)
    mouvement = MouvementStock.objects.get(genre="inventaire")
    assert (mouvement.sens, mouvement.quantite) == (-1, Decimal(3))
    controle.refresh_from_db()
    assert controle.statut == "fait"
    assert LigneJournal.objects.filter(action="stock.controle_fait").exists()


def test_grand_ecart_attend_le_proprietaire(client_de, gerant, proprietaire, controle):
    reponse = _valider(client_de(gerant), controle, farine="90", levure="102")
    assert reponse.json()["demande"].startswith("DEM-")
    assert stock.quantites()["farine"] == Decimal(100)
    assert stock.quantites()["levure"] == Decimal(102)
    demande = Demande.objects.get(type="inventaire")
    url = reverse("api:demande-accorder", kwargs={"pk": demande.pk})
    assert client_de(proprietaire).post(url, {}, format="json").status_code == 200
    assert stock.quantites()["farine"] == Decimal(90)
    assert not controle.lignes.filter(statut="soumise").exists()


def test_refus_laisse_le_stock(client_de, gerant, proprietaire, controle):
    _valider(client_de(gerant), controle, farine="90", levure="100")
    demande = Demande.objects.get(type="inventaire")
    url = reverse("api:demande-refuser", kwargs={"pk": demande.pk})
    reponse = client_de(proprietaire).post(url, {"motif": "Recompter"}, format="json")
    assert reponse.status_code == 200
    assert stock.quantites()["farine"] == Decimal(100)
    assert controle.lignes.filter(statut="refusee").count() == 1


def test_comptage_incomplet(client_de, gerant, controle):
    reponse = _valider(client_de(gerant), controle, farine="100")
    assert reponse.json()["code"] == "comptage_incomplet"
    assert reponse.json()["manquantes"] == ["levure"]


def test_un_autre_jour_refuse(client_de, gerant, controle):
    dimanche = ControleStock.objects.exclude(pk=controle.pk).get()
    reponse = client_de(gerant).post(_url("commencer", dimanche))
    assert reponse.json()["code"] == "controle_pas_aujourdhui"


def test_caissiere_refusee(client_de, caissiere, controle):
    assert client_de(caissiere).post(_url("commencer", controle)).status_code == 403


def test_rappel_du_jour(gerant, responsable_production, controle):
    assert rappel_controle() == 1
    controle.refresh_from_db()
    assert controle.statut == "a_faire"
    assert Notification.objects.filter(genre="stock.controle").exists()
    assert rappel_controle() == 0


def test_controle_manque_en_alerte(client_de, proprietaire, gerant, controle):
    jeudi = datetime(2026, 10, 29, 0, 30, tzinfo=YAOUNDE)
    with mock.patch("django.utils.timezone.now", return_value=jeudi):
        assert marquer_controles_manques() == 1
    controle.refresh_from_db()
    assert controle.statut == "manque"
    alertes = client_de(proprietaire).get(reverse("api:alertes")).json()
    assert "controle_stock_manque" in {alerte["type"] for alerte in alertes}
