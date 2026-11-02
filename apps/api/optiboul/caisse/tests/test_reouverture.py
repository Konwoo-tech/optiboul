from unittest import mock

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Semaine
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def fermee(client_de, caissiere, planning_rachel, horloge) -> Caisse:
    client = client_de(caissiere)
    caisse_id = client.post(reverse("api:caisse-ouvrir"), {"fonds": 20_000}).json()[
        "id"
    ]
    with mock.patch("optiboul.caisse.api.caisses.demander_sauvegarde"):
        client.post(
            reverse("api:caisse-fermer", kwargs={"pk": caisse_id}),
            {"compte": 19_000},
        )
    return Caisse.objects.get(pk=caisse_id)


def _rouvrir(
    client,
    caisse: Caisse,
    motif: str = "Billet de 1 000 oublié sous le tiroir",
):
    url = reverse("api:caisse-rouvrir", kwargs={"pk": caisse.pk})
    return client.post(url, {"motif": motif}, format="json")


def test_le_gerant_rouvre_avec_un_motif(client_de, fermee, gerant, proprietaire):
    reponse = _rouvrir(client_de(gerant), fermee)
    assert reponse.status_code == 200, reponse.content
    caisse = reponse.json()
    assert caisse["statut"] == "rouverte"
    assert caisse["en_cours"] is True
    assert (caisse["attendu"], caisse["compte"], caisse["ecart"]) == (None, None, None)

    trace = LigneJournal.objects.get(action="caisse.rouverte")
    assert trace.acteur == gerant
    assert trace.avant == {
        "statut": "fermee",
        "attendu": 20_000,
        "compte": 19_000,
        "ecart": -1_000,
    }
    assert trace.apres == {
        "statut": "rouverte",
        "motif": "Billet de 1 000 oublié sous le tiroir",
    }
    alerte = Notification.objects.get(genre="caisse.rouverte")
    assert alerte.destinataire == proprietaire
    assert alerte.titre == "Caisse de jour du 27/10 rouverte par Willy"
    assert alerte.message == "Motif : Billet de 1 000 oublié sous le tiroir"


def test_refermer_apres_reouverture(client_de, fermee, gerant, caissiere):
    _rouvrir(client_de(gerant), fermee)
    with mock.patch("optiboul.caisse.api.caisses.demander_sauvegarde"):
        reponse = client_de(caissiere).post(
            reverse("api:caisse-fermer", kwargs={"pk": fermee.pk}),
            {"compte": 20_000},
        )
    assert reponse.json()["resultat"] == "JUSTE"


def test_motif_obligatoire(client_de, fermee, proprietaire):
    reponse = _rouvrir(client_de(proprietaire), fermee, motif="   ")
    assert reponse.status_code in {400, 409}


def test_ni_la_caissiere_ni_une_caisse_ouverte(client_de, fermee, caissiere, gerant):
    assert _rouvrir(client_de(caissiere), fermee).json()["code"] == "droit_insuffisant"
    _rouvrir(client_de(gerant), fermee)
    assert _rouvrir(client_de(gerant), fermee).json()["code"] == "caisse_non_fermee"


def test_pas_de_reouverture_apres_la_cloture_de_la_semaine(client_de, fermee, gerant):
    Semaine.objects.update(statut="cloturee")
    assert _rouvrir(client_de(gerant), fermee).json()["code"] == "semaine_non_ouverte"
