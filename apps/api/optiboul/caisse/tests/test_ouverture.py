from datetime import date
from datetime import datetime

import pytest
from django.urls import reverse

from optiboul.caisse.domain.caisses import FUSEAU
from optiboul.caisse.domain.caisses import creneau_de
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Semaine
from optiboul.notifications.infrastructure.models import Notification
from optiboul.users.tests.factories import utilisateur_avec_profil

OUVRIR = reverse("api:caisse-ouvrir")
PROCHAINE = reverse("api:caisse-prochaine")
LISTE = reverse("api:caisse-list")


@pytest.mark.parametrize(
    ("heure", "attendu"),
    [
        (datetime(2026, 10, 27, 6, 0, tzinfo=FUSEAU), (date(2026, 10, 27), "jour")),
        (datetime(2026, 10, 27, 17, 59, tzinfo=FUSEAU), (date(2026, 10, 27), "jour")),
        (datetime(2026, 10, 27, 18, 0, tzinfo=FUSEAU), (date(2026, 10, 27), "nuit")),
        (datetime(2026, 10, 28, 5, 59, tzinfo=FUSEAU), (date(2026, 10, 27), "nuit")),
    ],
)
def test_creneau_de_jour_et_de_nuit(heure, attendu):
    assert creneau_de(heure) == attendu


@pytest.mark.django_db
def test_fonds_de_20_000_propose_et_caissiere_planifiee(
    client_de,
    caissiere,
    planning_rachel,
    horloge,
):
    prochaine = client_de(caissiere).get(PROCHAINE).json()
    assert prochaine == {
        "jour": "2026-10-27",
        "creneau": "jour",
        "planifiee": {"id": caissiere.pk, "nom": "Rachel"},
        "fonds_propose": 20_000,
        "caisse_en_cours": None,
    }


@pytest.mark.django_db
def test_la_caissiere_planifiee_ouvre_sa_caisse(
    client_de,
    caissiere,
    planning_rachel,
    horloge,
):
    reponse = client_de(caissiere).post(OUVRIR, {"fonds": 20_000}, format="json")
    assert reponse.status_code == 201, reponse.content
    caisse = reponse.json()
    assert caisse["jour"] == "2026-10-27"
    assert caisse["creneau"] == "jour"
    assert caisse["fonds"] == 20_000
    assert caisse["statut"] == "ouverte"
    assert caisse["hors_planning"] is False
    assert Notification.objects.count() == 0
    assert LigneJournal.objects.get(action="caisse.ouverte").apres == {
        "jour": "2026-10-27",
        "creneau": "jour",
        "fonds": 20_000,
    }


@pytest.mark.django_db
def test_hors_planning_signale_au_gerant_et_trace(
    client_de,
    gerant,
    planning_rachel,
    horloge,
):
    davy = utilisateur_avec_profil("caissier", name="Davy")
    reponse = client_de(davy).post(OUVRIR, {"fonds": 18_000}, format="json")
    assert reponse.json()["hors_planning"] is True
    assert reponse.json()["planifiee"]["nom"] == "Rachel"
    alerte = Notification.objects.get()
    assert alerte.destinataire == gerant
    assert alerte.titre == "Caisse de jour ouverte par Davy"
    assert LigneJournal.objects.filter(action="caisse.hors_planning").count() == 1


@pytest.mark.django_db
def test_une_caisse_par_creneau(client_de, caissiere, planning_rachel, horloge):
    client = client_de(caissiere)
    client.post(OUVRIR, {"fonds": 20_000}, format="json")
    reponse = client.post(OUVRIR, {"fonds": 20_000}, format="json")
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "caisse_deja_ouverte"
    Caisse.objects.update(statut="fermee", en_cours=False)
    assert client.post(OUVRIR, {"fonds": 20_000}, format="json").json()["code"] == (
        "creneau_deja_ferme"
    )


@pytest.mark.django_db
def test_sans_semaine_ouverte_pas_de_caisse(client_de, caissiere, s44, horloge):
    Semaine.objects.update(statut="planifiee")
    reponse = client_de(caissiere).post(OUVRIR, {"fonds": 20_000}, format="json")
    assert reponse.json()["code"] == "semaine_non_ouverte"


@pytest.mark.django_db
def test_qui_ouvre_et_qui_voit(
    client_de,
    caissiere,
    responsable_production,
    s44,
    horloge,
):
    assert (
        client_de(responsable_production).post(OUVRIR, {"fonds": 1}).status_code == 403
    )
    assert (
        client_de(caissiere).post(OUVRIR, {"fonds": -5}, format="json").status_code
        == 400
    )
    client_de(caissiere).post(OUVRIR, {"fonds": 20_000}, format="json")
    davy = utilisateur_avec_profil("caissier", name="Davy")
    # Une caissière ne voit que ses caisses ; la direction les voit toutes.
    assert client_de(davy).get(LISTE).json()["count"] == 0
    assert client_de(caissiere).get(LISTE).json()["count"] == 1
