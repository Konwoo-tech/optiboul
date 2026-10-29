from datetime import date

import pytest
from django.urls import reverse

from optiboul.core.domain.planning import Creneau
from optiboul.core.domain.planning import conflits
from optiboul.core.domain.planning import vides
from optiboul.core.domain.semaines import bornes
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users.tests.factories import utilisateur_avec_profil

LUNDI = date(2026, 10, 26)
MARDI = date(2026, 10, 27)


def test_quatorze_creneaux_et_alerte_si_vide():
    periode = bornes(2026, 44)
    assert len(vides(periode, {})) == 14
    assert vides(periode, {(LUNDI, Creneau.JOUR): 1}) == vides(periode, {})[1:]


def test_conflits_de_planning():
    assert conflits(
        {
            (LUNDI, Creneau.NUIT): 7,
            (MARDI, Creneau.JOUR): 7,
            (MARDI, Creneau.NUIT): 8,
        },
    ) == [{"genre": "nuit_puis_jour", "jour": LUNDI, "caissiere": 7}]
    assert conflits({(LUNDI, Creneau.JOUR): 7, (LUNDI, Creneau.NUIT): 7}) == [
        {"genre": "jour_et_nuit", "jour": LUNDI, "caissiere": 7},
    ]


@pytest.fixture
def s44(client_de, proprietaire, gerant):
    reponse = client_de(proprietaire).post(
        reverse("api:semaine-list"),
        {"annee": 2026, "numero": 44, "gerant": gerant.pk},
        format="json",
    )
    return reponse.json()["semaine"]["id"]


def _url(semaine_id: int) -> str:
    return reverse("api:semaine-planning", kwargs={"pk": semaine_id})


def _placer(client, semaine_id, jour, creneau, caissiere):
    return client.put(
        _url(semaine_id),
        {
            "jour": jour,
            "creneau": creneau,
            "caissiere": caissiere.pk if caissiere else None,
        },
        format="json",
    )


@pytest.mark.django_db
def test_planning_vide_signale(client_de, caissiere, s44):
    planning = client_de(caissiere).get(_url(s44)).json()
    assert len(planning["creneaux"]) == 14
    assert planning["creneaux"][0] == {
        "jour": "2026-10-26",
        "creneau": "jour",
        "caissiere": None,
    }
    assert len(planning["vides"]) == 14


@pytest.mark.django_db
def test_le_gerant_de_la_semaine_place_une_caissiere(client_de, gerant, caissiere, s44):
    reponse = _placer(client_de(gerant), s44, "2026-10-26", "nuit", caissiere)
    assert reponse.status_code == 200
    planning = reponse.json()
    assert planning["creneaux"][1]["caissiere"]["nom"] == "Rachel"
    assert len(planning["vides"]) == 13
    trace = LigneJournal.objects.get(action="planning.creneau")
    assert trace.apres == {
        "jour": "2026-10-26",
        "creneau": "nuit",
        "caissiere": caissiere.pk,
    }


@pytest.mark.django_db
def test_une_caissiere_par_creneau_et_conflit_signale(
    client_de,
    proprietaire,
    caissiere,
    s44,
):
    davy = utilisateur_avec_profil("caissier", name="Davy")
    client = client_de(proprietaire)
    _placer(client, s44, "2026-10-26", "nuit", caissiere)
    # Le créneau change de caissière : il n'y en a toujours qu'une.
    planning = _placer(client, s44, "2026-10-26", "nuit", davy).json()
    assert planning["creneaux"][1]["caissiere"]["nom"] == "Davy"
    planning = _placer(client, s44, "2026-10-27", "jour", davy).json()
    assert planning["conflits"] == [
        {"genre": "nuit_puis_jour", "jour": "2026-10-26", "caissiere": davy.pk},
    ]
    planning = _placer(client, s44, "2026-10-26", "nuit", None).json()
    assert planning["creneaux"][1]["caissiere"] is None


@pytest.mark.django_db
def test_refus(client_de, proprietaire, gerant, caissiere, s44):
    patrick = utilisateur_avec_profil("gerant", name="Patrick")
    reponse = _placer(client_de(patrick), s44, "2026-10-26", "jour", caissiere)
    assert reponse.json()["code"] == "droit_insuffisant"
    reponse = _placer(client_de(caissiere), s44, "2026-10-26", "jour", caissiere)
    assert reponse.status_code == 403
    reponse = _placer(client_de(proprietaire), s44, "2026-11-02", "jour", caissiere)
    assert reponse.json()["code"] == "jour_hors_semaine"
    reponse = _placer(client_de(proprietaire), s44, "2026-10-26", "jour", gerant)
    assert reponse.json()["code"] == "profil_inadapte"


@pytest.mark.django_db
def test_copier_la_semaine_precedente_reprend_le_planning(
    client_de,
    proprietaire,
    caissiere,
):
    client = client_de(proprietaire)
    liste = reverse("api:semaine-list")
    s43 = client.post(liste, {"annee": 2026, "numero": 43}, format="json").json()[
        "semaine"
    ]
    _placer(client, s43["id"], "2026-10-19", "nuit", caissiere)
    s44 = client.post(liste, {"annee": 2026, "numero": 44}, format="json").json()[
        "semaine"
    ]
    client.post(reverse("api:semaine-copier-precedente", kwargs={"pk": s44["id"]}))
    planning = client.get(_url(s44["id"])).json()
    assert planning["creneaux"][1] == {
        "jour": "2026-10-26",
        "creneau": "nuit",
        "caissiere": {"id": caissiere.pk, "nom": "Rachel", "profil": "caissier"},
    }
