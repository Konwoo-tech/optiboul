from datetime import date
from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from optiboul.achats.infrastructure.models import Manquant
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.stocks.infrastructure.models import Matiere

pytestmark = pytest.mark.django_db


def _planifier(minoterie, gerant, quantite):
    return ReceptionPlanifiee.objects.create(
        fournisseur=minoterie,
        matiere=Matiere.objects.get(code="farine"),
        quantite=Decimal(quantite),
        prevue_le=date(2026, 10, 27),
        planifiee_par=gerant,
    )


def _receptionner(client, planifiee, quantite):
    return client.post(
        reverse("api:reception-planifiee-receptionner", kwargs={"pk": planifiee.pk}),
        {"quantite": quantite},
        format="json",
    )


@pytest.fixture
def manquant(client_de, gerant, s44, minoterie, horloge):
    minoterie.telephone = "677412018"
    minoterie.save()
    assert (
        _receptionner(
            client_de(gerant),
            _planifier(minoterie, gerant, 1500),
            "1450",
        ).status_code
        == 201
    )
    return Manquant.objects.get()


def _url(nom, manquant):
    return reverse(f"api:manquant-{nom}", kwargs={"pk": manquant.pk})


def test_ecart_cree_le_manquant(manquant):
    assert (manquant.quantite, manquant.statut) == (Decimal(50), "a_livrer")


def test_quantite_complete_sans_manquant(client_de, gerant, s44, minoterie, horloge):
    _receptionner(client_de(gerant), _planifier(minoterie, gerant, 1500), "1500")
    assert not Manquant.objects.exists()


def test_liste_et_alerte(client_de, gerant, manquant):
    client = client_de(gerant)
    lignes = client.get(
        reverse("api:manquant-list"),
        {"statut": "a_livrer"},
    ).json()["results"]
    assert lignes[0]["fournisseur"] == "Minoterie du Centre"
    alertes = client.get(reverse("api:alertes")).json()
    assert "manquants_fournisseurs" in {alerte["type"] for alerte in alertes}


def test_relancer_par_whatsapp(client_de, gerant, manquant):
    assert client_de(gerant).post(_url("relancer", manquant)).status_code == 204
    message = MessageSortant.objects.get(canal="whatsapp")
    assert "50" in message.contenu
    manquant.refresh_from_db()
    assert manquant.relances == 1
    assert LigneJournal.objects.filter(action="manquant.relance").exists()


def test_relance_sans_telephone(client_de, gerant, manquant, minoterie):
    minoterie.telephone = ""
    minoterie.save()
    reponse = client_de(gerant).post(_url("relancer", manquant))
    assert reponse.json()["code"] == "telephone_absent"


def test_replanifier_puis_livrer(client_de, gerant, manquant, horloge):
    client = client_de(gerant)
    jour = timezone.localdate() + timedelta(days=3)
    reponse = client.post(
        _url("replanifier", manquant),
        {"prevue_le": jour.isoformat()},
        format="json",
    )
    assert reponse.json()["statut"] == "replanifie"
    manquant.refresh_from_db()
    assert manquant.replanifiee.quantite == Decimal(50)
    deja = client.post(_url("relancer", manquant))
    assert deja.json()["code"] == "manquant_clos"
    assert _receptionner(client, manquant.replanifiee, "50").status_code == 201
    manquant.refresh_from_db()
    assert manquant.statut == "livre"
    assert Manquant.objects.count() == 1


def test_replanification_partielle_garde_le_reste(
    client_de,
    gerant,
    manquant,
    horloge,
):
    client = client_de(gerant)
    jour = timezone.localdate() + timedelta(days=3)
    client.post(
        _url("replanifier", manquant),
        {"prevue_le": jour.isoformat()},
        format="json",
    )
    manquant.refresh_from_db()
    _receptionner(client, manquant.replanifiee, "30")
    reste = Manquant.objects.get(statut="a_livrer")
    assert reste.quantite == Decimal(20)


def test_date_passee(client_de, gerant, manquant, horloge):
    reponse = client_de(gerant).post(
        _url("replanifier", manquant),
        {"prevue_le": "2026-01-01"},
        format="json",
    )
    assert reponse.json()["code"] == "date_passee"


def test_caissiere_refusee(client_de, caissiere, manquant):
    assert client_de(caissiere).post(_url("relancer", manquant)).status_code == 403
