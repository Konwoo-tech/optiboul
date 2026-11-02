from datetime import date
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse

from optiboul.clients.domain.clients import construire_releve
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant

YAOUNDE = ZoneInfo("Africa/Douala")


def test_solde_courant():
    releve = construire_releve(
        -500,
        [
            (date(2026, 10, 27), "livraison", -1, 2_000),
            (date(2026, 10, 28), "encaissement", 1, 1_500),
        ],
    )
    assert [ligne.solde for ligne in releve.lignes] == [-2_500, -1_000]
    assert releve.lignes[0].debit == 2_000
    assert releve.lignes[0].libelle == "Livraison"
    assert releve.lignes[1].credit == 1_500
    assert releve.solde_final == -1_000


pytestmark = pytest.mark.django_db


@pytest.fixture
def mama(s44, caissiere):
    client = Client.objects.create(nom="Mama Rasta", telephone="699112233")
    for jour, sens, montant, origine in [
        (20, -1, 500, "reprise"),
        (27, -1, 2_000, "livraison"),
        (28, 1, 1_500, "encaissement"),
    ]:
        MouvementCompte.objects.create(
            client=client,
            semaine=s44,
            sens=sens,
            montant=montant,
            source_type=origine,
            source_id=1,
            auteur=caissiere,
            cree_le=datetime(2026, 10, jour, 12, 0, tzinfo=YAOUNDE),
        )
    return client


def _url(nom, client):
    return reverse(f"api:client-{nom}", kwargs={"pk": client.pk})


PERIODE = {"du": "2026-10-26", "au": "2026-10-28"}


def test_historique_de_la_periode(client_de, gerant, mama):
    corps = client_de(gerant).get(_url("releve", mama), PERIODE).json()
    assert corps["solde_initial"] == -500
    assert corps["solde_final"] == -1_000
    assert [ligne["libelle"] for ligne in corps["lignes"]] == [
        "Livraison",
        "Encaissement",
    ]


def test_periode_invalide(client_de, gerant, mama):
    reponse = client_de(gerant).get(
        _url("releve", mama),
        {"du": "2026-10-28", "au": "2026-10-26"},
    )
    assert reponse.status_code == 400


def test_pdf(client_de, gerant, mama):
    reponse = client_de(gerant).get(_url("releve-pdf", mama), PERIODE)
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")


def test_envoi_par_whatsapp(client_de, caissiere, mama):
    reponse = client_de(caissiere).post(
        _url("envoyer-releve", mama),
        PERIODE,
        format="json",
    )
    assert reponse.status_code == 204
    message = MessageSortant.objects.get(canal="whatsapp")
    assert "Mama Rasta" in message.contenu
    assert LigneJournal.objects.filter(action="clients.releve_envoye").exists()


def test_envoi_sans_numero(client_de, gerant, mama):
    mama.telephone = ""
    mama.save()
    reponse = client_de(gerant).post(
        _url("envoyer-releve", mama),
        PERIODE,
        format="json",
    )
    assert reponse.json()["code"] == "telephone_absent"


def test_production_refusee(client_de, responsable_production, mama):
    url = _url("releve", mama)
    assert client_de(responsable_production).get(url, PERIODE).status_code == 403
